export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  city?: string;
}

export interface Profile {
  id: string;
  name: string;
  avatar_url?: string;
  city?: string;
  phone?: string;
  bio?: string;
  rating?: number;
  total_sales?: number;
  created_at: string;
  favorite_genres?: string[];
}

export interface Book {
  id: string;
  title: string;
  author: string;
  price?: number;
  listing_type: 'free' | 'sale' | 'trade';
  condition: 'new' | 'like_new' | 'good' | 'fair';
  category: string;
  genres?: string[];
  description?: string;
  images: string[];
  city: string;
  location_lat?: number;
  location_lng?: number;
  looking_for?: string;
  user_id: string;
  status: 'active' | 'completed' | 'unlisted';
  created_at: string;
  updated_at: string;
  // Joined fields
  profiles?: Profile;
  distance?: number;
}

export interface BookFilters {
  genres?: string[];
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  category?: string;
  condition?: string;
  listingType?: string;
  city?: string;
}
