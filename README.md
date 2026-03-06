# BookLoop Mobile App 📚

React Native mobile app for BookLoop - Share books with your community

## Tech Stack

- **React Native** with **Expo**
- **TypeScript**
- **Supabase** for backend (shared with web app)
- **React Navigation** for routing
- **Zustand** for state management

## Features

✅ **Authentication**
- Email/password login and signup
- Session persistence
- User profiles

✅ **Browse Books**
- Grid and list views
- Search by title/author
- Filter by location, price, and type

✅ **Book Details**
- Full book information
- Seller details
- Contact seller

## Getting Started

### Prerequisites

- Node.js 20.x
- npm or yarn
- Expo Go app (for testing on physical device)
  - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
  - [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment variables**
   - The `.env` file is already configured with Supabase credentials from the web app

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Run on your device**
   - Scan the QR code with Expo Go (Android) or Camera app (iOS)
   - Or press `a` for Android emulator, `i` for iOS simulator

## Project Structure

```
src/
├── components/      # Reusable components
│   └── AuthProvider.tsx
├── navigation/      # Navigation setup
│   └── AppNavigator.tsx
├── screens/         # App screens
│   ├── LoginScreen.tsx
│   ├── HomeScreen.tsx
│   ├── CatalogScreen.tsx
│   ├── ProfileScreen.tsx
│   └── BookDetailScreen.tsx
├── stores/          # Zustand state management
│   └── authStore.ts
├── lib/             # Utilities & Supabase client
│   └── supabase.ts
└── types/           # TypeScript types
    └── index.ts
```

## Available Scripts

- `npm start` - Start Expo development server
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS simulator (macOS only)
- `npm run web` - Run in web browser

## Development Notes

### Shared Backend

This mobile app uses the **same Supabase backend** as the web app (`Project_BookLink`):
- Shared database, authentication, and storage
- Users can log in on both web and mobile with the same credentials
- Books published on web appear in mobile app and vice versa

### Next Steps

Future features to implement:
- [ ] Publish books (camera, image upload, AI detection)
- [ ] Real-time messaging between users
- [ ] Push notifications
- [ ] Location-based filtering with maps
- [ ] Favorites and wishlist
- [ ] User ratings and reviews
- [ ] Hebrew/English language toggle

## Building for Production

### Android

```bash
eas build --platform android
```

### iOS

```bash
eas build --platform ios
```

Requires an Expo account and EAS CLI setup.

## Testing

Test credentials (if test users exist in your Supabase database):
- Email: test@example.com
- Password: testpassword

Or create a new account in the app.

## Support

For issues or questions, refer to:
- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [Supabase Documentation](https://supabase.com/docs)

---

Built with ❤️ for the book-loving community
