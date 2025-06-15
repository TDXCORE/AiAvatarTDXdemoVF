import { SimpleAvatarState } from "@/lib/avatar-simple-client";

interface AvatarPreviewProps {
  avatarState: SimpleAvatarState;
  className?: string;
}

export function AvatarPreview({ avatarState, className }: AvatarPreviewProps) {
  if (!avatarState.previewUrl) {
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
      <img
        src={avatarState.previewUrl}
        alt="Dr. Carlos Mendoza"
        className="w-full h-full object-cover"
        onError={(e) => {
          console.warn('Avatar preview image failed to load');
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
        <h3 className="text-white font-semibold text-lg">Dr. Carlos Mendoza</h3>
        <p className="text-white/80 text-sm">Psicólogo Clínico Especializado</p>
      </div>
    </div>
  );
}