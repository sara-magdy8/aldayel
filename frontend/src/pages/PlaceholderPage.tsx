import { Construction } from "lucide-react";

const PlaceholderPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
      <Construction size={64} className="mb-4 opacity-40" />
      <p className="text-xl font-medium">قريباً — هذه الصفحة تحت الإنشاء</p>
    </div>
  );
};

export default PlaceholderPage;
