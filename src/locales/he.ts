import type { Translations } from './en';

export const he: Translations = {
  // Navigation
  nav: {
    home: 'בית',
    catalog: 'קטלוג',
    publish: 'פרסום',
    messages: 'הודעות',
    profile: 'פרופיל',
  },

  // Common
  common: {
    loading: 'טוען...',
    error: 'אירעה שגיאה',
    noResults: 'לא נמצאו תוצאות',
    save: 'שמור',
    cancel: 'ביטול',
    delete: 'מחק',
    edit: 'ערוך',
    back: 'חזור',
    search: 'חיפוש',
    filter: 'סינון',
    apply: 'החל',
    reset: 'איפוס',
    signIn: 'התחבר',
    signUp: 'הרשם',
    signOut: 'התנתק',
    ok: 'אישור',
    success: 'הצלחה',
    all: 'הכל',
  },

  // Auth
  auth: {
    welcome: 'ברוכים הבאים לספרלי',
    subtitle: 'שתפו ספרים עם הקהילה',
    joinTitle: '📚 הצטרף לספרלי',
    createAccountSubtitle: 'צור את החשבון שלך',
    email: 'אימייל',
    password: 'סיסמה',
    confirmPassword: 'אימות סיסמה',
    name: 'שם מלא',
    city: 'עיר',
    login: 'התחבר',
    signup: 'הרשם',
    logout: 'התנתק',
    createAccount: 'צור חשבון',
    haveAccount: 'כבר יש לך חשבון?',
    noAccount: 'אין לך חשבון?',
    continueWithGoogle: 'המשך עם Google',
    signingIn: 'מתחבר...',
    creatingAccount: 'יוצר חשבון...',
    fillAllFields: 'אנא מלא את כל השדות',
    passwordsNoMatch: 'הסיסמאות לא תואמות',
    passwordTooShort: 'הסיסמה חייבת להיות לפחות 6 תווים',
    passwordMin: 'סיסמה (מינימום 6 תווים)',
    accountCreatedTitle: 'הצלחה!',
    accountCreatedMessage: 'החשבון נוצר בהצלחה. אנא בדוק את האימייל שלך לאימות החשבון.',
    appTitle: '📚 ספרלי',
  },

  // Home
  home: {
    greeting: 'שלום',
    subtitle: 'גלה ספרים באזורך',
    featured: 'ספרים מומלצים',
    emptyText: 'אין ספרים זמינים עדיין',
  },

  // Catalog
  catalog: {
    title: 'עיון בספרים',
    searchPlaceholder: 'חפש לפי כותרת או מחבר...',
    filters: 'סינון',
    sortBy: 'מיין לפי',
    resultsCount: 'ספרים נמצאו',
    noBooks: 'לא נמצאו ספרים',
  },

  // Book
  book: {
    condition: {
      new: 'חדש',
      like_new: 'כמו חדש',
      good: 'טוב',
      fair: 'סביר',
    },
    listingType: {
      free: 'חינם',
      sale: 'למכירה',
      trade: 'החלפה',
    },
    free: 'חינם',
    lookingFor: 'מחפש:',
    seller: 'מוכר',
    contactSeller: 'צור קשר עם המוכר',
    description: 'תיאור',
    notFound: 'הספר לא נמצא',
    by: 'מאת',
    conditionLabel: 'מצב:',
    location: 'מיקום:',
    genres: 'ז\'אנרים:',
    signInRequiredTitle: 'נדרשת התחברות',
    signInRequiredMessage: 'אנא התחבר כדי ליצור קשר עם המוכר',
  },

  // Publish
  publish: {
    title: 'פרסם ספר',
    subtitle: 'שתף את הספר שלך עם הקהילה',
    signInRequired: 'התחבר כדי לפרסם',
    signInMessage: 'צור חשבון כדי לשתף את הספרים שלך עם הקהילה',
    photos: 'תמונות (אופציונלי)',
    gallery: 'גלריה',
    camera: 'מצלמה',
    listingType: 'סוג פרסום',
    bookTitle: 'שם הספר',
    author: 'מחבר',
    condition: 'מצב',
    price: 'מחיר (₪)',
    lookingFor: 'מחפש',
    description: 'תיאור (אופציונלי)',
    descriptionPlaceholder: 'הוסף פרטים נוספים על הספר...',
    titlePlaceholder: 'הזן שם ספר',
    authorPlaceholder: 'הזן שם מחבר',
    pricePlaceholder: '0',
    lookingForPlaceholder: 'איזה ספר אתה מחפש?',
    publish: 'פרסם ספר',
    required: '*',
    fillRequired: 'אנא מלא את כל השדות הנדרשים',
    enterPrice: 'אנא הזן מחיר',
    specifyLookingFor: 'אנא ציין מה אתה מחפש',
    success: 'הצלחה!',
    bookPublished: 'הספר שלך פורסם',
    permissionNeeded: 'נדרשת הרשאה',
    allowPhotos: 'אנא אפשר גישה לתמונות שלך',
    allowCamera: 'אנא אפשר גישה למצלמה',
    error: 'שגיאה',
  },

  // Profile
  profile: {
    title: 'פרופיל',
    myBooks: 'הספרים שלי',
    favorites: 'מועדפים',
    settings: 'הגדרות',
    signInRequired: '📚 התחבר כדי להמשיך',
    signInMessage: 'צור חשבון או התחבר כדי לפרסם ספרים, לשלוח הודעות ולנהל את הפרופיל שלך',
    createAccount: 'צור חשבון',
    account: 'חשבון',
    signOutConfirm: 'האם אתה בטוח שברצונך להתנתק?',
    version: 'BookLoop גרסה 1.0.0',
    updateSuccess: 'הפרופיל עודכן בהצלחה',
  },

  // Messages
  messages: {
    title: 'הודעות',
    signInRequired: 'התחבר כדי לצפות בהודעות',
    signInMessage: 'צור חשבון כדי לשוחח עם בעלי ספרים',
    noConversations: 'אין שיחות עדיין',
    startChatting: 'התחל לשוחח על ידי יצירת קשר עם בעלי ספרים',
    comingSoon: 'בקרוב...',
    typePlaceholder: 'הקלד הודעה...',
  },

  // Settings
  settings: {
    title: 'הגדרות',
    language: 'שפה',
    english: 'English',
    hebrew: 'עברית',
    languageChanged: 'השפה שונתה בהצלחה',
    account: 'חשבון',
    editProfile: 'ערוך פרופיל',
    changePassword: 'שנה סיסמה',
    deleteAccount: 'מחק חשבון',
    about: 'אודות',
    version: 'גרסה',
    termsOfService: 'תנאי שימוש',
    privacyPolicy: 'מדיניות פרטיות',
  },

  // My Books
  myBooks: {
    title: 'הספרים שלי',
    noBooks: 'עדיין לא פרסמת ספרים',
    publishFirst: 'פרסם את הספר הראשון שלך',
    active: 'פעיל',
    sold: 'נמכר',
    edit: 'ערוך',
    delete: 'מחק',
    confirmDelete: 'האם אתה בטוח שברצונך למחוק ספר זה?',
  },

  // Notifications
  notifications: {
    sectionTitle: 'התראות',
    messages: 'התראות הודעות',
    promptTitle: 'הישאר בעניינים',
    promptBody: 'קבל התראה כשמישהו שולח לך הודעה על ספר',
    enable: 'הפעל התראות',
    later: 'אולי מאוחר יותר',
    permissionRequired: 'נדרשת הרשאה',
    permissionMessage: 'אנא אפשר התראות בהגדרות המכשיר',
  },

  // Chat
  chat: {
    sendFailed: 'לא הצלחנו לשלוח את ההודעה. נסה שוב.',
  },

  // Favorites
  wishlist: {
    title: 'המועדפים שלי',
    addToWishlist: 'הוסף למועדפים',
    removeFromWishlist: 'הסר מהמועדפים',
    emptyTitle: 'אין מועדפים עדיין',
    emptySubtitle: 'שמור ספרים שמעניינים אותך כדי לצפות בהם מאוחר יותר',
    added: 'נוסף למועדפים',
    removed: 'הוסר מהמועדפים',
  },
};
