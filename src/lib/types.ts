export type Category = "optical" | "sun";
export type Swatch = { hex: string; filter: string };
export type LensOption = {
  id: string;
  addOnId: string;
  name: string;
  price: number;
  description: string;
  isDefault: boolean;
};
export type Product = {
  id: string;
  slug: string;
  name: string;
  category: Category;
  brand: string;
  description: string;
  price: number;
  originalPrice: number;
  stock: number;
  sold: number;
  rating: number;
  image: string;
  images: string[];
  sizes: string[];
  colors: string[];
  swatches: Swatch[];
  shape: string;
  material: string;
  dimensions: string;
  weight: string;
  tag: string;
  reviewCount: number;
  lenses: LensOption[];
  finishes: LensOption[];
};
export type CatalogPage = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};
export type Eye = {
  eye: "right" | "left";
  sphere: number;
  cylinder: number;
  axis: number;
};
export type Prescription = { pd: number; eyes: Eye[] } | { power: string };
export type LensSelection = {
  size: string;
  color: string;
  lens: string;
  coating: string;
  prescription: Prescription | null;
};
export type User = {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  guest: boolean;
};
export type AddOn = { groupName: string; name: string; price: number };
export type CartLine = LensSelection & {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  available: boolean;
  addOns: AddOn[];
  product: Product;
};
export type Address = {
  id: string;
  label: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
  isDefault: boolean;
};
export type OrderAddress = Omit<Address, "id" | "isDefault"> & {
  email: string;
};
export type OrderItem = LensSelection & {
  productId: string;
  name: string;
  image: string;
  category: Category;
  quantity: number;
  price: number;
  lineTotal: number;
  addOns: AddOn[];
};
export type OrderStatus =
  | "placed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";
export type Order = {
  id: string;
  number: number;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  address: OrderAddress;
  shippingMethod: string;
  shippingName: string;
  paymentMethod: string;
  coupon: string;
  events: { status: string; time: string; text: string }[];
  createdAt: string;
  updatedAt: string;
};
export type Review = {
  id: string;
  rating: number;
  text: string;
  author: string;
  verified: boolean;
  likes: number;
  liked: boolean;
  mine: boolean;
  createdAt: string;
};
export type SupportRequest = {
  id: string;
  sender: "customer" | "support";
  message: string;
  createdAt: string;
};
export type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
};
export type ShippingMethod = {
  code: string;
  name: string;
  days: string;
  price: number;
  isDefault: boolean;
};
export type Quote = {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  promo: string;
  cartVersion: number;
};
export type Bootstrap = {
  user: User;
  cart: CartLine[];
  cartVersion: number;
  subtotal: number;
  wishlist: string[];
  addresses: Address[];
  payments: PaymentMethod[];
  orders: Order[];
  requests: SupportRequest[];
  shippingMethods: ShippingMethod[];
};
