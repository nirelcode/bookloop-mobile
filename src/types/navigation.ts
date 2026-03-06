import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';

export type RootStackParamList = {
  MainTabs: { screen?: keyof MainTabParamList } | undefined;
  BookDetail: { bookId: string };
  SellerProfile: { sellerId: string; sellerName?: string };
  Settings: undefined;
  MyBooks: undefined;
  EditBook: { bookId: string };
  Chat: { chatId?: string; recipientId: string; recipientName: string; recipientAvatar?: string; bookId?: string };
  EditProfile: undefined;
  Wishlist: undefined;
  BlockedUsers: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Catalog: { initialListingType?: string } | undefined;
  Publish: undefined;
  Messages: undefined;
  Profile: undefined;
};

export type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export type CatalogScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Catalog'>,
  NativeStackNavigationProp<RootStackParamList>
>;
