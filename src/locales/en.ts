export const en = {
  // Navigation
  nav: {
    home: 'Home',
    catalog: 'Catalog',
    publish: 'Publish',
    messages: 'Messages',
    profile: 'Profile',
  },

  // Common
  common: {
    loading: 'Loading...',
    error: 'An error occurred',
    noResults: 'No results found',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    back: 'Back',
    search: 'Search',
    filter: 'Filter',
    apply: 'Apply',
    reset: 'Reset',
    signIn: 'Sign In',
    signUp: 'Sign Up',
    signOut: 'Sign Out',
    ok: 'OK',
    success: 'Success',
    all: 'All',
  },

  // Auth
  auth: {
    welcome: 'Welcome to BookLoop',
    subtitle: 'Share books with your community',
    joinTitle: '📚 Join BookLoop',
    createAccountSubtitle: 'Create your account',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    name: 'Full Name',
    city: 'City',
    login: 'Sign In',
    signup: 'Sign Up',
    logout: 'Sign Out',
    createAccount: 'Create Account',
    haveAccount: 'Already have an account?',
    noAccount: "Don't have an account?",
    continueWithGoogle: 'Continue with Google',
    signingIn: 'Signing in...',
    creatingAccount: 'Creating account...',
    fillAllFields: 'Please fill in all fields',
    passwordsNoMatch: 'Passwords do not match',
    passwordTooShort: 'Password must be at least 6 characters',
    passwordMin: 'Password (min 6 characters)',
    accountCreatedTitle: 'Success!',
    accountCreatedMessage: 'Account created successfully. Please check your email to verify your account.',
    appTitle: '📚 BookLoop',
  },

  // Home
  home: {
    greeting: 'Hello',
    subtitle: 'Discover books near you',
    featured: 'Featured Books',
    emptyText: 'No books available yet',
  },

  // Catalog
  catalog: {
    title: 'Browse Books',
    searchPlaceholder: 'Search by title or author...',
    filters: 'Filters',
    sortBy: 'Sort by',
    resultsCount: 'books found',
    noBooks: 'No books found',
  },

  // Book
  book: {
    condition: {
      new: 'New',
      like_new: 'Like New',
      good: 'Good',
      fair: 'Fair',
    },
    listingType: {
      free: 'Free',
      sale: 'For Sale',
      trade: 'Trade',
    },
    free: 'Free',
    lookingFor: 'Looking for:',
    seller: 'Seller',
    contactSeller: 'Contact Seller',
    description: 'Description',
    notFound: 'Book not found',
    by: 'by',
    conditionLabel: 'Condition:',
    location: 'Location:',
    genres: 'Genres:',
    signInRequiredTitle: 'Sign in required',
    signInRequiredMessage: 'Please sign in to contact the seller',
  },

  // Publish
  publish: {
    title: 'Publish a Book',
    subtitle: 'Share your book with the community',
    signInRequired: 'Sign in to publish',
    signInMessage: 'Create an account to share your books with the community',
    photos: 'Photos (Optional)',
    gallery: 'Gallery',
    camera: 'Camera',
    listingType: 'Listing Type',
    bookTitle: 'Book Title',
    author: 'Author',
    condition: 'Condition',
    price: 'Price (₪)',
    lookingFor: 'Looking For',
    description: 'Description (Optional)',
    descriptionPlaceholder: 'Add more details about the book...',
    titlePlaceholder: 'Enter book title',
    authorPlaceholder: 'Enter author name',
    pricePlaceholder: '0',
    lookingForPlaceholder: 'What book are you looking for?',
    publish: 'Publish Book',
    required: '*',
    fillRequired: 'Please fill in all required fields',
    enterPrice: 'Please enter a price',
    specifyLookingFor: "Please specify what you're looking for",
    success: 'Success!',
    bookPublished: 'Your book has been published',
    permissionNeeded: 'Permission needed',
    allowPhotos: 'Please allow access to your photos',
    allowCamera: 'Please allow camera access',
    error: 'Error',
  },

  // Profile
  profile: {
    title: 'Profile',
    myBooks: 'My Books',
    favorites: 'Favorites',
    settings: 'Settings',
    signInRequired: '📚 Sign in to continue',
    signInMessage: 'Create an account or sign in to publish books, message sellers, and manage your profile',
    createAccount: 'Create Account',
    account: 'Account',
    signOutConfirm: 'Are you sure you want to sign out?',
    version: 'BookLoop v1.0.0',
    updateSuccess: 'Profile updated successfully',
  },

  // Messages
  messages: {
    title: 'Messages',
    signInRequired: 'Sign in to view messages',
    signInMessage: 'Create an account to chat with book owners',
    noConversations: 'No conversations yet',
    startChatting: 'Start chatting by contacting book owners',
    comingSoon: 'Coming soon...',
    typePlaceholder: 'Type a message...',
  },

  // Settings
  settings: {
    title: 'Settings',
    language: 'Language',
    english: 'English',
    hebrew: 'עברית',
    languageChanged: 'Language changed successfully',
    account: 'Account',
    editProfile: 'Edit Profile',
    changePassword: 'Change Password',
    deleteAccount: 'Delete Account',
    about: 'About',
    version: 'Version',
    termsOfService: 'Terms of Service',
    privacyPolicy: 'Privacy Policy',
  },

  // My Books
  myBooks: {
    title: 'My Books',
    noBooks: 'You haven\'t published any books yet',
    publishFirst: 'Publish your first book',
    active: 'Active',
    sold: 'Sold',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: 'Are you sure you want to delete this book?',
  },

  // Notifications
  notifications: {
    sectionTitle: 'Notifications',
    messages: 'Message notifications',
    promptTitle: 'Stay in the loop',
    promptBody: 'Get notified when someone messages you about a book',
    enable: 'Turn on notifications',
    later: 'Maybe later',
    permissionRequired: 'Permission required',
    permissionMessage: 'Please enable notifications in your device settings',
  },

  // Chat
  chat: {
    sendFailed: 'Couldn\'t send message. Please try again.',
  },

  // Favorites
  wishlist: {
    title: 'Favorites',
    addToWishlist: 'Add to Favorites',
    removeFromWishlist: 'Remove from Favorites',
    emptyTitle: 'No favorites yet',
    emptySubtitle: 'Save books you\'re interested in to view them later',
    added: 'Added to favorites',
    removed: 'Removed from favorites',
  },
};

export type Translations = typeof en;
