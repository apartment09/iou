import {
  Baby,
  Banknote,
  Beer,
  Bus,
  Car,
  Clapperboard,
  Coffee,
  CreditCard,
  Dog,
  Droplets,
  Dumbbell,
  Flower,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  Handshake,
  Heart,
  House,
  Leaf,
  Music,
  Package,
  PartyPopper,
  Phone,
  Pizza,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Tag,
  TrainFront,
  Utensils,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Curated Lucide set for categories — explicit imports keep the bundle
 * small (the full lucide map would defeat tree-shaking). DB stores the
 * kebab-case key; unknown keys (e.g. old emoji) fall back to a tag. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  'shopping-bag': ShoppingBag,
  utensils: Utensils,
  pizza: Pizza,
  coffee: Coffee,
  beer: Beer,
  bus: Bus,
  'train-front': TrainFront,
  car: Car,
  fuel: Fuel,
  plane: Plane,
  house: House,
  zap: Zap,
  droplets: Droplets,
  wifi: Wifi,
  phone: Phone,
  clapperboard: Clapperboard,
  music: Music,
  'gamepad-2': Gamepad2,
  'party-popper': PartyPopper,
  gift: Gift,
  heart: Heart,
  shirt: Shirt,
  scissors: Scissors,
  sparkles: Sparkles,
  dumbbell: Dumbbell,
  stethoscope: Stethoscope,
  baby: Baby,
  dog: Dog,
  leaf: Leaf,
  flower: Flower,
  'graduation-cap': GraduationCap,
  'credit-card': CreditCard,
  banknote: Banknote,
  package: Package,
  tag: Tag,
};

/** Icon for a category; name=null is the "Default" category (receipt),
 * 'handshake' is used for settlements. */
export function CategoryIcon({ name, className = 'h-5 w-5' }: { name: string | null; className?: string }) {
  const Icon = name === null ? Receipt : name === 'handshake' ? Handshake : (CATEGORY_ICONS[name] ?? Tag);
  return <Icon className={className} aria-hidden />;
}

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
        <button
          key={key}
          type="button"
          title={key}
          onClick={() => onChange(key)}
          className={`flex h-9 items-center justify-center rounded-lg transition-colors ${
            value === key
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
