# Quick Start Guide 🚀

Get your BookLoop mobile app running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

This will install all required packages including React Native, Expo, Supabase, and navigation libraries.

## Step 2: Start the Development Server

```bash
npm start
```

This will start the Expo development server and show a QR code in your terminal.

## Step 3: Run on Your Device

### Option A: Physical Device (Recommended for Testing)

1. **Install Expo Go on your phone:**
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. **Scan the QR code:**
   - iOS: Open Camera app and scan the QR code
   - Android: Open Expo Go app and tap "Scan QR code"

3. **Wait for the app to load** (first time may take a minute)

### Option B: Emulator/Simulator

**Android Emulator:**
```bash
npm run android
```
(Requires Android Studio and an Android Virtual Device)

**iOS Simulator (macOS only):**
```bash
npm run ios
```
(Requires Xcode)

## Step 4: Test the App

### Login Screen
- **Sign Up:** Create a new account with any email and password
- **Sign In:** Use existing credentials from your web app

### Browse Books
- **Home Tab:** See recently added books in a grid layout
- **Catalog Tab:** Search and filter all books
- **Profile Tab:** View your profile and account settings

### View Book Details
- Tap any book card to see full details
- View seller information
- See book images, description, price, and location

## Common Issues

### "Unable to resolve module"
```bash
npm install
npx expo start --clear
```

### QR Code Not Working
- Make sure your phone and computer are on the same WiFi network
- Try using the "Tunnel" connection method in Expo

### Changes Not Reflecting
- Shake your device (or press Ctrl+M on Android, Cmd+D on iOS)
- Tap "Reload" in the development menu

## Next Steps

Now that your app is running, you can:

1. **Browse existing books** from your web app database
2. **Create an account** and test authentication
3. **Search for books** by title or author
4. **View book details** and seller profiles

## Development Tips

- **Auto-reload:** The app automatically reloads when you save files
- **Console logs:** Check the terminal for console.log output
- **React Native Debugger:** Shake device → "Debug" for advanced debugging
- **Fast Refresh:** Enabled by default, preserves component state

## File Structure

Key files to edit:
- `src/screens/` - Add or modify screens
- `src/components/` - Create reusable components
- `src/navigation/AppNavigator.tsx` - Add new routes
- `src/lib/supabase.ts` - Supabase configuration
- `App.tsx` - Root component

## Useful Commands

```bash
# Start development server
npm start

# Start with cache clearing
npx expo start --clear

# Run on Android
npm run android

# Run on iOS (macOS only)
npm run ios

# Run in web browser
npm run web

# Install new package
npm install package-name
```

## Getting Help

- **Expo Docs:** https://docs.expo.dev/
- **React Native Docs:** https://reactnative.dev/
- **Supabase Docs:** https://supabase.com/docs

Happy coding! 📚✨
