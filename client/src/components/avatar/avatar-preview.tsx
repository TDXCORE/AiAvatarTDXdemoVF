import { Loader2 } from "lucide-react";

interface AvatarPreviewProps {
  avatarId: string;
  className?: string;
}

export function AvatarPreview({ avatarId, className }: AvatarPreviewProps) {
  return (
    <div className={`relative w-full h-full bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-900 dark:to-green-900 rounded-lg overflow-hidden ${className}`}>
      {/* Placeholder avatar animation while loading */}
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-32 h-32 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-green-500 rounded-full flex items-center justify-center">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center">
              <span className="text-3xl font-bold text-blue-600">DC</span>
            </div>
          </div>
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
            Dr. Carlos Mendoza
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Psicólogo Clínico
          </p>
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-sm text-gray-500">Preparando consulta...</span>
          </div>
        </div>
      </div>
      
      {/* Animated pulse effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
    </div>
  );
}