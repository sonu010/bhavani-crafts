import { MessageCircle } from "lucide-react";

export function WhatsAppFab() {
  return (
    <a
      href="https://wa.me/919876543210?text=Hi%2C%20I%27d%20like%20to%20enquire%20about%20craft%20supplies."
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
    >
      <MessageCircle className="w-6 h-6" />
    </a>
  );
}
