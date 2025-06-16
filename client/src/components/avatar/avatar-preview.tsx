import { StreamingAvatarState } from "@/lib/streaming-avatar-client";

interface AvatarPreviewProps {
  avatarState: StreamingAvatarState;
  className?: string;
}

export function AvatarPreview({ avatarState, className }: AvatarPreviewProps) {
  if (!avatarState.sessionToken) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900 rounded-lg ${className || ''}`}>
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
            <span className="text-2xl">👨‍⚕️</span>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Dr. Carlos Mendoza</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Psicólogo Clínico</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-lg overflow-hidden ${className || ''}`}>
      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-20 h-20 mx-auto mb-4 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-2xl">👨‍⚕️</span>
          </div>
          <h3 className="text-lg font-medium mb-2">Dr. Carlos Mendoza</h3>
          <p className="text-sm opacity-80">Streaming Avatar Ready</p>
        </div>
      </div>
    </div>
  );
}