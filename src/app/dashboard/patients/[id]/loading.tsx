export default function PatientDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center space-x-4 mb-6">
          <div className="h-9 w-24 bg-gray-200 rounded animate-pulse" />
        </div>

        <div className="space-y-2">
          <div className="h-9 w-64 bg-gray-200 rounded animate-pulse" />
          <div className="h-5 w-96 bg-gray-200 rounded animate-pulse" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-32 w-full bg-gray-200 rounded animate-pulse" />
            <div className="space-y-3">
              <div className="h-16 w-full bg-gray-200 rounded animate-pulse" />
              <div className="h-16 w-full bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-64 w-full bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
