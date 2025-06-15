import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CallButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export function CallButton({ onClick, disabled }: CallButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size="lg"
      className="bg-green-500 hover:bg-green-600 text-white rounded-full p-4 shadow-lg transition-all duration-200 hover:scale-105"
    >
      <Phone className="w-6 h-6" />
      <span className="ml-2">Llamar Dr. Carlos</span>
    </Button>
  );
}