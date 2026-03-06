# Troubleshooting Guide 🔧

## "Something went wrong" Error

### Quick Fixes:

1. **Check WiFi Connection**
   - Make sure your phone and computer are on the **same WiFi network**
   - Corporate/school networks may block connections

2. **Reload the App**
   - In Expo Go: Pull down to reload
   - Or shake your phone → tap "Reload"

3. **Use Tunnel Mode** (if same WiFi doesn't work)
   - In terminal, press `s` to switch connection type
   - Select "Expo Go"
   - Select "Tunnel"
   - Scan the new QR code

4. **Clear Cache and Restart**
   ```bash
   # Stop the server (Ctrl+C in terminal)
   npm start -- --clear
   ```

5. **Check for Console Errors**
   - Look at the terminal for red error messages
   - Share them with Claude for specific help

---

## Common Errors and Solutions

### "Unable to resolve module"
```bash
npm install
npm start -- --clear
```

### "Metro bundler has encountered an internal error"
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
npm start
```

### "Network request failed" or "Supabase error"
- Check your `.env` file exists
- Verify Supabase credentials are correct
- Test internet connection

### TypeScript errors
```bash
# Check for errors
npx tsc --noEmit

# If errors found, report them to Claude
```

### "Expo Go app crashed"
- Make sure Expo Go app is up to date
- Try restarting your phone
- Clear Expo Go cache in phone settings

---

## If Nothing Works

1. **Try the web version** (to test if code works):
   ```bash
   npm install react-dom react-native-web
   npm run web
   ```

2. **Check Expo Doctor**:
   ```bash
   npx expo-doctor
   ```

3. **Reinstall dependencies**:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

4. **Create a new Expo project** and copy your code:
   ```bash
   npx create-expo-app test-app --template blank-typescript
   # Then copy src/ folder
   ```

---

## Getting Help

When reporting errors, please provide:
- ✅ Full error message (screenshot or text)
- ✅ Device type (iPhone/Android, model)
- ✅ Expo Go version
- ✅ What you were doing when error occurred
- ✅ Terminal output (last 20 lines)

Run this to get system info:
```bash
npx expo-doctor
```
