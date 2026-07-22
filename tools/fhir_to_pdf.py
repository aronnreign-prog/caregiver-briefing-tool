"""
fhir_to_pdf.py — STANDALONE test tool (kept out of app code).

Converts a Synthea FHIR R4 patient bundle into multiple realistic medical PDFs
using reportlab. Each FHIR Encounter becomes a "visit note / lab results" PDF.
Two additional summary PDFs are produced: a medications list and a problem list.

Intended only for pipeline testing (pdfjs text extraction -> Graphiti).
"""

import json
import os
import sys
from collections import defaultdict

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)


def sanitize(value, max_len=40):
    if value is None:
        return ""
    value = str(value).replace("/", "-").replace(":", "-")
    value = value.replace("\\", "-").replace("*", "-").replace("?", "-")
    if len(value) > max_len:
        value = value[:max_len]
    return value.strip()


def code_text(codeable):
    """Return the human-readable text for a CodeableConcept."""
    if not codeable:
        return ""
    if codeable.get("text"):
        return codeable["text"]
    for c in codeable.get("coding", []):
        if c.get("display"):
            return c["display"]
    return ""


def coding_display(codeable):
    if not codeable:
        return ""
    for c in codeable.get("coding", []):
        if c.get("display"):
            return c["display"]
    return ""


def loinc_code(codeable):
    if not codeable:
        return ""
    for c in codeable.get("coding", []):
        if c.get("system") == "http://loinc.org" and c.get("code"):
            return c["code"]
    return ""


def dosage_text(mr):
    parts = []
    for di in mr.get("dosageInstruction", []) or []:
        if di.get("text"):
            parts.append(di["text"])
        else:
            if di.get("doseAndRate"):
                for dr in di["doseAndRate"]:
                    dose = dr.get("doseQuantity")
                    if dose:
                        parts.append(
                            "Dose: %s %s" % (dose.get("value"), dose.get("unit"))
                        )
    return "; ".join(parts)


def load_bundle(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def index_resources(bundle):
    by_type = defaultdict(list)
    for entry in bundle.get("entry", []):
        res = entry.get("resource")
        if res and res.get("resourceType"):
            by_type[res["resourceType"]].append(res)
    return by_type


def ref_id(reference):
    """Extract the uuid from a reference like 'urn:uuid:xxxx' or 'Encounter/xxxx'."""
    if not reference:
        return None
    if ":" in reference:
        return reference.split(":", 1)[1]
    return reference.split("/", 1)[-1]


def build_fullurl_map(bundle):
    """Map fullUrl (e.g. 'urn:uuid:xxxx') -> resource dict.

    Synthea references resources by their entry 'fullUrl', which does NOT
    always equal the resource's own 'id'. We must resolve via fullUrl.
    """
    mapping = {}
    for entry in bundle.get("entry", []):
        full = entry.get("fullUrl")
        res = entry.get("resource")
        if full and res:
            mapping[full] = res
        # Also allow lookup by plain id as a fallback.
        if res and res.get("id"):
            mapping[res["id"]] = res
    return mapping


def build_patient_demographics(patient):
    name = patient.get("name", [{}])[0]
    full = " ".join(name.get("given", []) + [name.get("family", "")])
    prefix = " ".join(name.get("prefix", []))
    if prefix:
        full = prefix + " " + full
    return {
        "name": full.strip(),
        "dob": patient.get("birthDate", "Unknown"),
        "gender": patient.get("gender", "Unknown"),
        "id": patient.get("id", ""),
    }


def group_by_encounter(bundle, fullurl_map):
    """Map encounter fullUrl -> {encounter, observations, medications, conditions}.

    References are resolved through the entry 'fullUrl' (Synthea uses urn:uuid
    references that differ from the resource 'id').
    """
    encounters = {}
    for entry in bundle.get("entry", []):
        res = entry.get("resource")
        if res and res.get("resourceType") == "Encounter":
            full = entry.get("fullUrl")
            encounters[full] = res

    groups = defaultdict(lambda: {"encounter": None, "observations": [], "medications": [], "conditions": []})

    for entry in bundle.get("entry", []):
        res = entry.get("resource")
        if not res:
            continue
        rt = res.get("resourceType")
        if rt == "Observation":
            eref = res.get("encounter", {}).get("reference")
            if eref and eref in encounters:
                groups[eref]["encounter"] = encounters[eref]
                groups[eref]["observations"].append(res)
        elif rt == "MedicationRequest":
            eref = res.get("encounter", {}).get("reference")
            if eref and eref in encounters:
                groups[eref]["encounter"] = encounters[eref]
                groups[eref]["medications"].append(res)
        elif rt == "Condition":
            eref = res.get("encounter", {}).get("reference")
            if eref and eref in encounters:
                groups[eref]["encounter"] = encounters[eref]
                groups[eref]["conditions"].append(res)

    return encounters, groups, fullurl_map


def encounter_date(enc):
    period = enc.get("period", {})
    start = period.get("start") or period.get("end")
    return start or ""


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="DocTitle", parent=styles["Title"], fontSize=16, spaceAfter=6
    ))
    styles.add(ParagraphStyle(
        name="Section", parent=styles["Heading2"], fontSize=12,
        textColor=colors.HexColor("#1a3c5e"), spaceBefore=10, spaceAfter=4
    ))
    styles.add(ParagraphStyle(
        name="Body", parent=styles["BodyText"], fontSize=9.5, leading=13
    ))
    styles.add(ParagraphStyle(
        name="Small", parent=styles["BodyText"], fontSize=8, leading=10,
        textColor=colors.HexColor("#555555")
    ))
    return styles


def render_table(rows, col_widths, styles):
    if not rows:
        return [Paragraph("None recorded.", styles["Body"])]
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3c5e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#bbbbbb")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f6fa")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    return [table]


def build_visit_pdf(path, patient, enc, group, styles):
    doc = SimpleDocTemplate(
        path, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        title="Visit Note"
    )
    flow = []
    flow.append(Paragraph("Patient Visit Note &amp; Lab Results", styles["DocTitle"]))
    flow.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a3c5e")))
    flow.append(Spacer(1, 6))

    meta = [
        ["Patient", patient["name"], "Date of Birth", patient["dob"]],
        ["Gender", patient["gender"], "MRN", sanitize(patient["id"], 30)],
    ]
    period = enc.get("period", {})
    enc_type = coding_display((enc.get("type") or [{}])[0]) if enc.get("type") else ""
    meta.append(["Visit Date", encounter_date(enc)[:10], "Encounter Type", enc_type])
    meta.append(["Encounter ID", sanitize(enc.get("id"), 30), "Status", enc.get("status", "")])
    t = Table(meta, colWidths=[1.1 * inch, 2.4 * inch, 1.2 * inch, 2.3 * inch])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef3f8")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#eef3f8")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    flow.append(t)
    flow.append(Spacer(1, 10))

    # Observations / lab results
    flow.append(Paragraph("Laboratory Results &amp; Vitals", styles["Section"]))
    obs_rows = [["Test", "Result", "Unit", "Date", "LOINC"]]
    for obs in group["observations"]:
        desc = code_text(obs.get("code")) or "(unnamed observation)"
        vq = obs.get("valueQuantity") or {}
        val = vq.get("value", "")
        unit = vq.get("unit") or vq.get("code") or ""
        eff = (obs.get("effectiveDateTime") or "")[:10]
        obs_rows.append([
            Paragraph(desc, styles["Small"]),
            str(val),
            unit,
            eff,
            loinc_code(obs.get("code")),
        ])
    flow.extend(render_table(obs_rows,
                             [2.5 * inch, 0.9 * inch, 0.8 * inch, 0.9 * inch, 0.9 * inch],
                             styles))

    # Medications during this visit
    flow.append(Paragraph("Medications Ordered", styles["Section"]))
    med_rows = [["Medication", "Authored", "Dosage"]]
    for mr in group["medications"]:
        med_rows.append([
            Paragraph(code_text(mr.get("medicationCodeableConcept")), styles["Small"]),
            (mr.get("authoredOn") or "")[:10],
            Paragraph(dosage_text(mr) or "—", styles["Small"]),
        ])
    flow.extend(render_table(med_rows,
                             [2.6 * inch, 1.0 * inch, 2.8 * inch], styles))

    # Diagnoses/conditions during this visit
    flow.append(Paragraph("Diagnoses / Problems", styles["Section"]))
    cond_rows = [["Description", "Onset"]]
    for cond in group["conditions"]:
        onset = cond.get("onsetDateTime") or cond.get("recordedDate") or ""
        cond_rows.append([
            Paragraph(code_text(cond.get("code")), styles["Small"]),
            onset[:10],
        ])
    flow.extend(render_table(cond_rows, [4.4 * inch, 2.0 * inch], styles))

    flow.append(Spacer(1, 14))
    flow.append(Paragraph(
        "This document was generated from a Synthea FHIR R4 bundle for pipeline "
        "testing. It is synthetic data and not for clinical use.", styles["Small"]))

    doc.build(flow)


def build_medications_pdf(path, patient, meds, styles):
    doc = SimpleDocTemplate(
        path, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        title="Medications List"
    )
    flow = []
    flow.append(Paragraph("Active Medications List", styles["DocTitle"]))
    flow.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a3c5e")))
    flow.append(Spacer(1, 4))
    flow.append(Paragraph(
        "Patient: %s &nbsp;&nbsp; DOB: %s &nbsp;&nbsp; Gender: %s"
        % (patient["name"], patient["dob"], patient["gender"]), styles["Body"]))
    flow.append(Spacer(1, 8))

    rows = [["Medication", "Authored On", "Dosage / Instructions"]]
    # sort by authoredOn desc
    meds_sorted = sorted(meds, key=lambda m: m.get("authoredOn", ""), reverse=True)
    for mr in meds_sorted:
        rows.append([
            Paragraph(code_text(mr.get("medicationCodeableConcept")), styles["Small"]),
            (mr.get("authoredOn") or "")[:10],
            Paragraph(dosage_text(mr) or "As directed", styles["Small"]),
        ])
    flow.extend(render_table(rows, [2.6 * inch, 1.1 * inch, 2.7 * inch], styles))
    flow.append(Spacer(1, 14))
    flow.append(Paragraph(
        "Synthetic data generated from FHIR bundle for pipeline testing.",
        styles["Small"]))
    doc.build(flow)


def build_problems_pdf(path, patient, conds, styles):
    doc = SimpleDocTemplate(
        path, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        title="Problem List"
    )
    flow = []
    flow.append(Paragraph("Problem List", styles["DocTitle"]))
    flow.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1a3c5e")))
    flow.append(Spacer(1, 4))
    flow.append(Paragraph(
        "Patient: %s &nbsp;&nbsp; DOB: %s &nbsp;&nbsp; Gender: %s"
        % (patient["name"], patient["dob"], patient["gender"]), styles["Body"]))
    flow.append(Spacer(1, 8))

    rows = [["Problem / Condition", "Clinical Status", "Onset Date"]]
    conds_sorted = sorted(
        conds,
        key=lambda c: (c.get("onsetDateTime") or c.get("recordedDate") or ""),
        reverse=True
    )
    for cond in conds_sorted:
        status = coding_display(
            (cond.get("clinicalStatus") or {}).get("coding", [{}])[0]
        ) if cond.get("clinicalStatus") else ""
        onset = cond.get("onsetDateTime") or cond.get("recordedDate") or ""
        rows.append([
            Paragraph(code_text(cond.get("code")), styles["Small"]),
            status,
            onset[:10],
        ])
    flow.extend(render_table(rows, [3.4 * inch, 1.6 * inch, 1.4 * inch], styles))
    flow.append(Spacer(1, 14))
    flow.append(Paragraph(
        "Synthetic data generated from FHIR bundle for pipeline testing.",
        styles["Small"]))
    doc.build(flow)


def safe_date_key(enc):
    return encounter_date(enc) or "0000"


def main():
    if len(sys.argv) < 3:
        print("Usage: fhir_to_pdf.py <bundle.json> <output_dir>")
        sys.exit(1)

    bundle_path = sys.argv[1]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)

    bundle = load_bundle(bundle_path)
    by_type = index_resources(bundle)
    fullurl_map = build_fullurl_map(bundle)
    patient = build_patient_demographics(by_type["Patient"][0])
    encounters, groups, _ = group_by_encounter(bundle, fullurl_map)

    styles = make_styles()

    # Choose encounters: those with the most observations, capped at 15,
    # sorted by date descending (most recent first).
    ranked = []
    for eid, grp in groups.items():
        enc = grp["encounter"]
        if not enc:
            continue
        obs_count = len(grp["observations"])
        ranked.append((eid, enc, obs_count))
    # Prefer lab-rich encounters; tie-break by most recent date.
    ranked.sort(key=lambda x: (x[2], safe_date_key(x[1])), reverse=True)
    selected = ranked[:15]

    generated = []
    name_part = sanitize(patient["name"].replace(" ", "_"), 30)

    for eid, enc, obs_count in selected:
        grp = groups[eid]
        date_part = sanitize(safe_date_key(enc)[:10], 10)
        enc_short = sanitize(ref_id(eid), 8)
        fname = "%s_%s_visit_%s.pdf" % (name_part, date_part, enc_short)
        fpath = os.path.join(out_dir, fname)
        build_visit_pdf(fpath, patient, enc, grp, styles)
        generated.append(fpath)

    # Medications summary
    med_path = os.path.join(out_dir, "%s_medications_list.pdf" % name_part)
    build_medications_pdf(med_path, patient, by_type.get("MedicationRequest", []), styles)
    generated.append(med_path)

    # Problems summary
    prob_path = os.path.join(out_dir, "%s_problem_list.pdf" % name_part)
    build_problems_pdf(prob_path, patient, by_type.get("Condition", []), styles)
    generated.append(prob_path)

    print("Patient: %s (%s, DOB %s)" % (patient["name"], patient["gender"], patient["dob"]))
    print("Encounters available: %d, selected: %d" % (len(encounters), len(selected)))
    print("PDFs generated: %d" % len(generated))
    for g in generated:
        print("  %s  (%d bytes)" % (os.path.basename(g), os.path.getsize(g)))


if __name__ == "__main__":
    main()
