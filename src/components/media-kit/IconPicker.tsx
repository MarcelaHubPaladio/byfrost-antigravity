import { useState } from "react";
import { 
  Search, 
  X, 
  Smile, 
  Home, 
  User, 
  Settings, 
  Mail, 
  Phone, 
  Calendar, 
  MapPin, 
  Clock, 
  Info,
  Heart,
  Star,
  Check,
  Plus,
  ArrowRight,
  ChevronRight,
  Play,
  Share2,
  Lock,
  Eye,
  Camera,
  Layers,
  ShoppingBag,
  CreditCard,
  Gift,
  Bell,
  Search as SearchIcon,
  Trash2,
  Edit2,
  Download,
  Upload,
  ExternalLink,
  MessageSquare,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Linkedin,
  Github,
  Award,
  Book,
  Briefcase,
  Car,
  Coffee,
  Globe,
  Music,
  Tv,
  Wifi,
  Wind,
  Sun,
  Moon,
  Cloud,
  Umbrella,
  Zap,
  Target,
  Shield,
  Rocket,
  Lightbulb,
  Key,
  Flame,
  Fingerprint,
  Compass,
  Anchor,
  Activity,
  Trees,
  CloudRain,
  Snowflake,
  Mountain,
  Waves,
  Palette,
  Layout,
  PieChart,
  BarChart,
  LineChart,
  TrendingUp,
  Cpu,
  Database,
  Terminal,
  Code,
  Smartphone,
  Tablet,
  Laptop,
  Monitor,
  Headphones,
  Mic,
  Speaker,
  Volume2,
  Video,
  Scissors,
  PenTool,
  Sticker,
  Brush,
  Eraser,
  Printer,
  Copy,
  Scissors as ScissorsIcon,
  Coffee as CoffeeIcon,
  Utensils,
  GlassWater,
  Beer,
  Pizza,
  Apple,
  Fish,
  Bird,
  Cat,
  Dog,
  Feather,
  Flower,
  Leaf,
  BicepsFlexed,
  Dumbbell,
  Timer,
  Trophy,
  Medal,
  Users,
  Building,
  Store,
  Warehouse,
  Factory,
  HardHat,
  Truck,
  Plane,
  Ship,
  Train,
  Bike,
  Navigation,
  Flag,
  Map,
  Milestone,
  Pin,
  Tag,
  Sticker as StickerIcon,
  Tickets,
  Coins,
  Wallet,
  Calculator,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  LineChart as LineChartIcon,
  Table,
  Files,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  Folder,
  FolderPlus,
  Archive,
  CloudUpload,
  CloudDownload,
} from "lucide-react";
import * as Icons from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";

// Map of common icons to display
const COMMON_ICONS = [
  "Home", "User", "Settings", "Mail", "Phone", "Calendar", "MapPin", "Clock", "Info",
  "Heart", "Star", "Check", "Plus", "ArrowRight", "ChevronRight", "Search", "Trash2",
  "Edit2", "Download", "Upload", "ExternalLink", "MessageSquare", "Facebook", "Instagram",
  "Twitter", "Youtube", "Linkedin", "Github", "Award", "Book", "Briefcase", "Car",
  "Coffee", "Globe", "Music", "Tv", "Wifi", "Wind", "Sun", "Moon", "Cloud", "Umbrella",
  "Zap", "Target", "Shield", "Rocket", "Lightbulb", "Key", "Flame", "Fingerprint",
  "Compass", "Anchor", "Activity", "Trees", "CloudRain", "Snowflake", "Mountain",
  "Waves", "Palette", "Layout", "PieChart", "BarChart", "LineChart", "TrendingUp",
  "Cpu", "Database", "Terminal", "Code", "Smartphone", "Tablet", "Laptop", "Monitor",
  "Headphones", "Mic", "Speaker", "Volume2", "Video", "Scissors", "PenTool", "Sticker",
  "Brush", "Eraser", "Printer", "Copy", "Utensils", "GlassWater", "Beer", "Pizza",
  "Apple", "Fish", "Bird", "Cat", "Dog", "Feather", "Flower", "Leaf", "BicepFlexed",
  "Dumbbell", "Timer", "Trophy", "Medal", "Users", "Building", "Store", "Warehouse",
  "Factory", "HardHat", "Truck", "Plane", "Ship", "Train", "Bike", "Navigation",
  "Flag", "Map", "Milestone", "Pin", "Tag", "Tickets", "Coins", "Wallet", "Calculator",
  "Table", "Files", "FileText", "FileImage", "FileVideo", "FileAudio", "Folder",
  "Archive", "CloudUpload", "CloudDownload"
];

interface IconPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (iconName: string) => void;
}

export function IconPicker({ open, onOpenChange, onSelect }: IconPickerProps) {
  const [search, setSearch] = useState("");

  const filteredIcons = COMMON_ICONS.filter(name => 
    name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Palette className="w-5 h-5 text-indigo-600" />
            Biblioteca de Ícones
          </DialogTitle>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Buscar ícone..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-slate-50 border-slate-200"
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
          {filteredIcons.map(name => {
            const IconComponent = (Icons as any)[name];
            if (!IconComponent) return null;
            
            return (
              <Button
                key={name}
                variant="outline"
                className="h-16 flex flex-col gap-2 rounded-xl border-slate-100 hover:border-indigo-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all p-2"
                onClick={() => {
                  onSelect(name);
                  onOpenChange(false);
                }}
              >
                <IconComponent className="w-6 h-6" />
                <span className="text-[10px] truncate w-full">{name}</span>
              </Button>
            );
          })}
          
          {filteredIcons.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 italic">
              Nenhum ícone encontrado para "{search}"
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
