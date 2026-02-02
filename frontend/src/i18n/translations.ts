/**
 * NEXRYDE Multi-Language System
 * Supports: English, Yoruba, Igbo, Hausa, Nigerian Pidgin
 */

export type SupportedLanguage = 'en' | 'yo' | 'ig' | 'ha' | 'pcm';

export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  rtl: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    rtl: false,
  },
  {
    code: 'pcm',
    name: 'Nigerian Pidgin',
    nativeName: 'Naija Pidgin',
    flag: '🇳🇬',
    rtl: false,
  },
  {
    code: 'yo',
    name: 'Yoruba',
    nativeName: 'Yorùbá',
    flag: '🇳🇬',
    rtl: false,
  },
  {
    code: 'ig',
    name: 'Igbo',
    nativeName: 'Igbo',
    flag: '🇳🇬',
    rtl: false,
  },
  {
    code: 'ha',
    name: 'Hausa',
    nativeName: 'Hausa',
    flag: '🇳🇬',
    rtl: false,
  },
];

// English Translations (Base)
export const en = {
  common: {
    welcome: 'Welcome',
    hello: 'Hello',
    thanks: 'Thank you',
    yes: 'Yes',
    no: 'No',
    ok: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    search: 'Search',
    filter: 'Filter',
    settings: 'Settings',
  },
  
  auth: {
    login: 'Login',
    logout: 'Logout',
    register: 'Register',
    phoneNumber: 'Phone Number',
    enterPhone: 'Enter your phone number',
    verifyOTP: 'Verify OTP',
    enterOTP: 'Enter verification code',
    resendOTP: 'Resend Code',
    continueText: 'Continue',
  },
  
  home: {
    whereTo: 'Where to?',
    enterDestination: 'Enter your destination',
    bookRide: 'Book a Ride',
    myTrips: 'My Trips',
    wallet: 'Wallet',
    more: 'More',
  },
  
  ride: {
    pickupLocation: 'Pickup Location',
    dropoffLocation: 'Dropoff Location',
    selectOnMap: 'Select on map',
    confirmPickup: 'Confirm Pickup',
    confirmDropoff: 'Confirm Dropoff',
    searchingDriver: 'Searching for driver...',
    driverFound: 'Driver Found!',
    arrivedPickup: 'Driver has arrived',
    tripStarted: 'Trip Started',
    tripCompleted: 'Trip Completed',
    rateDriver: 'Rate your driver',
    fare: 'Fare',
    distance: 'Distance',
    duration: 'Duration',
  },
  
  driver: {
    goOnline: 'Go Online',
    goOffline: 'Go Offline',
    acceptRide: 'Accept Ride',
    rejectRide: 'Reject',
    startTrip: 'Start Trip',
    completeTrip: 'Complete Trip',
    earnings: 'Earnings',
    todayEarnings: "Today's Earnings",
    weeklyEarnings: 'Weekly Earnings',
    totalRides: 'Total Rides',
    rating: 'Rating',
  },
  
  safety: {
    emergencySOS: 'Emergency SOS',
    shareTrip: 'Share Trip',
    emergencyContacts: 'Emergency Contacts',
    addContact: 'Add Contact',
    trustedDrivers: 'Trusted Drivers',
    safetyTips: 'Safety Tips',
  },
  
  wallet: {
    balance: 'Balance',
    addMoney: 'Add Money',
    withdraw: 'Withdraw',
    transactions: 'Transactions',
    topUp: 'Top Up',
    payment: 'Payment',
  },
  
  profile: {
    myProfile: 'My Profile',
    editProfile: 'Edit Profile',
    personalInfo: 'Personal Information',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    language: 'Language',
    changeLanguage: 'Change Language',
    notifications: 'Notifications',
    helpSupport: 'Help & Support',
  },
  
  verification: {
    driverVerification: 'Driver Verification',
    uploadDocuments: 'Upload Documents',
    ninVerified: 'NIN Verified',
    licenseVerified: 'License Verified',
    vehicleVerified: 'Vehicle Verified',
    backgroundCheck: 'Background Check',
    trustScore: 'Trust Score',
  },
  
  wellness: {
    driverWellness: 'Driver Wellness',
    takeBreak: 'Take a Break',
    wellnessScore: 'Wellness Score',
    drivingTime: 'Driving Time',
    breakTime: 'Break Time',
    restReminder: 'Time for a rest!',
    safetyFirst: 'Your safety comes first',
  },
  
  smartMode: {
    smartMode: 'Smart Mode',
    autoAccept: 'Auto-Accept Rides',
    customizeRules: 'Customize Rules',
    minDistance: 'Minimum Distance',
    maxDistance: 'Maximum Distance',
    minRating: 'Minimum Rating',
    surgePricing: 'Surge Pricing',
  },
};

// Yoruba Translations
export const yo = {
  common: {
    welcome: 'Ẹ káàbọ̀',
    hello: 'Báwo ni',
    thanks: 'Ẹ ṣé',
    yes: 'Bẹ́ẹ̀ni',
    no: 'Bẹ́ẹ̀kọ́',
    ok: 'Ó dára',
    cancel: 'Fagilé',
    save: 'Fi pamọ́',
    delete: 'Pajẹ',
    edit: 'Ṣàtúnṣe',
    loading: 'Ó ń kójọpọ̀...',
    error: 'Àṣìṣe',
    success: 'Àṣeyọrí',
    confirm: 'Jẹ́rìísí',
    back: 'Padà',
    next: 'Tókàn',
    done: 'Tí parí',
    search: 'Wá',
    filter: 'Yọrò',
    settings: 'Àwọn ètò',
  },
  
  auth: {
    login: 'Wọlé',
    logout: 'Jáde',
    register: 'Forúkọsilẹ̀',
    phoneNumber: 'Nọ́mbà fóònù',
    enterPhone: 'Tẹ nọ́mbà fóònù rẹ sínú',
    verifyOTP: 'Jẹ́rìísí kóòdù',
    enterOTP: 'Tẹ kóòdù ìfidájú',
    resendOTP: 'Ránṣẹ́ kóòdù',
    continueText: 'Tẹ̀síwájú',
  },
  
  home: {
    whereTo: 'Níbo lo fẹ́ lọ?',
    enterDestination: 'Tẹ ibi tó ń lọ sínú',
    bookRide: 'Ṣètò ìrìn-àjò',
    myTrips: 'Àwọn ìrìn-àjò mi',
    wallet: 'Àpamọ́wọ́',
    more: 'Sí i',
  },
  
  ride: {
    pickupLocation: 'Ibi ìgbémú',
    dropoffLocation: 'Ibi ìsọ̀kalẹ̀',
    selectOnMap: 'Yan lórí máàpù',
    confirmPickup: 'Jẹ́rìísí ibi ìgbémú',
    confirmDropoff: 'Jẹ́rìísí ibi ìsọ̀kalẹ̀',
    searchingDriver: 'Ó ń wá awakọ̀...',
    driverFound: 'Á rí awakọ̀!',
    arrivedPickup: 'Awakọ̀ ti dé',
    tripStarted: 'Ìrìn-àjò ti bẹ̀rẹ̀',
    tripCompleted: 'Ìrìn-àjò ti parí',
    rateDriver: 'Ṣe ìdíyelé awakọ̀',
    fare: 'Owó ọkọ̀',
    distance: 'Ìjìnnà',
    duration: 'Àkókò',
  },
  
  driver: {
    goOnline: 'Lọ sórí ayélujára',
    goOffline: 'Jáde lórí ayélujára',
    acceptRide: 'Gba ìrìn-àjò',
    rejectRide: 'Kọ̀',
    startTrip: 'Bẹ̀rẹ̀ ìrìn-àjò',
    completeTrip: 'Parí ìrìn-àjò',
    earnings: 'Èrè',
    todayEarnings: 'Èrè òní',
    weeklyEarnings: 'Èrè ọ̀sẹ̀',
    totalRides: 'Àpapọ̀ ìrìn-àjò',
    rating: 'Ìdíyelé',
  },
  
  safety: {
    emergencySOS: 'SOS Ìpayà',
    shareTrip: 'Pín ìrìn-àjò',
    emergencyContacts: 'Àwọn ẹni ìkànsí ìpayà',
    addContact: 'Fi ẹni ìkànsí kún',
    trustedDrivers: 'Àwọn awakọ̀ ìgbẹ́kẹ̀lé',
    safetyTips: 'Àwọn ìmọ̀ràn ààbò',
  },
  
  wallet: {
    balance: 'Owó tó kù',
    addMoney: 'Fi owó kún',
    withdraw: 'Yọ owó',
    transactions: 'Àwọn ìṣòwò',
    topUp: 'Fi owó kún',
    payment: 'Ìsanwó',
  },
  
  profile: {
    myProfile: 'Profaili mi',
    editProfile: 'Ṣàtúnṣe profaili',
    personalInfo: 'Àlàyé ti ara ẹni',
    name: 'Orúkọ',
    email: 'Ímeèlì',
    phone: 'Fóònù',
    language: 'Èdè',
    changeLanguage: 'Yí èdè padà',
    notifications: 'Àwọn ìkílokan',
    helpSupport: 'Ìrànlọ́wọ́',
  },
  
  verification: {
    driverVerification: 'Ìfidájú awakọ̀',
    uploadDocuments: 'Gbé àwọn ìwé kalẹ̀',
    ninVerified: 'NIN ti jẹ́rìísí',
    licenseVerified: 'Láyísẹ́ẹ̀nsì ti jẹ́rìísí',
    vehicleVerified: 'Ọkọ̀ ti jẹ́rìísí',
    backgroundCheck: 'Àyẹ̀wò ẹ̀yìn',
    trustScore: 'Àmì ìgbẹ́kẹ̀lé',
  },
  
  wellness: {
    driverWellness: 'Ìlera awakọ̀',
    takeBreak: 'Sinmi díẹ̀',
    wellnessScore: 'Àmì ìlera',
    drivingTime: 'Àkókò wíwakọ̀',
    breakTime: 'Àkókò ìsinmi',
    restReminder: 'Ó tó àkókò ìsinmi!',
    safetyFirst: 'Ààbò rẹ ṣe pàtàkì',
  },
  
  smartMode: {
    smartMode: 'Móòdù Ọlọ́gbọ́n',
    autoAccept: 'Gbà ìrìn-àjò fúnra rẹ',
    customizeRules: 'Ṣe òfin tirẹ',
    minDistance: 'Ìjìnnà tó kéré jù',
    maxDistance: 'Ìjìnnà tó pọ̀ jù',
    minRating: 'Ìdíyelé tó kéré jù',
    surgePricing: 'Owó àfikún',
  },
};

// Igbo Translations
export const ig = {
  common: {
    welcome: 'Nnọọ',
    hello: 'Kedu',
    thanks: 'Daalụ',
    yes: 'Ee',
    no: 'Mba',
    ok: 'Ọ dị mma',
    cancel: 'Kagbuo',
    save: 'Chekwaa',
    delete: 'Hichapụ',
    edit: 'Dezie',
    loading: 'Na-ebu...',
    error: 'Njehie',
    success: 'Ihe ịga nke ọma',
    confirm: 'Kwenye',
    back: 'Azụ',
    next: 'Ọzọ',
    done: 'Emechaa',
    search: 'Chọọ',
    filter: 'Họrọ',
    settings: 'Ntọala',
  },
  
  auth: {
    login: 'Banye',
    logout: 'Pụọ',
    register: 'Debanye aha',
    phoneNumber: 'Nọmba ekwentị',
    enterPhone: 'Tinye nọmba ekwentị gị',
    verifyOTP: 'Nyochaa koodu',
    enterOTP: 'Tinye koodu nkwenye',
    resendOTP: 'Ziga koodu ọzọ',
    continueText: 'Gaa n\'ihu',
  },
  
  home: {
    whereTo: 'Ebee ka ị na-aga?',
    enterDestination: 'Tinye ebe ị na-aga',
    bookRide: 'Kwuo njem',
    myTrips: 'Njem m',
    wallet: 'Akpa ego',
    more: 'Ọzọ',
  },
  
  ride: {
    pickupLocation: 'Ebe ị ga-ebu',
    dropoffLocation: 'Ebe ị ga-adọ',
    selectOnMap: 'Họrọ na maapụ',
    confirmPickup: 'Kwenye ebe ị ga-ebu',
    confirmDropoff: 'Kwenye ebe ị ga-adọ',
    searchingDriver: 'Na-achọ ọkwọ ụgbọala...',
    driverFound: 'Ahụla ọkwọ ụgbọala!',
    arrivedPickup: 'Ọkwọ ụgbọala abịala',
    tripStarted: 'Njem amalitela',
    tripCompleted: 'Njem emechala',
    rateDriver: 'Nye ọkwọ ụgbọala akara',
    fare: 'Ụgwọ njem',
    distance: 'Anya',
    duration: 'Oge',
  },
  
  driver: {
    goOnline: 'Gaa n\'ịntanetị',
    goOffline: 'Pụọ n\'ịntanetị',
    acceptRide: 'Nabata njem',
    rejectRide: 'Jụ',
    startTrip: 'Malite njem',
    completeTrip: 'Mechaa njem',
    earnings: 'Ego ị nwetara',
    todayEarnings: 'Ego taa',
    weeklyEarnings: 'Ego izu',
    totalRides: 'Ngụkọta njem',
    rating: 'Akara',
  },
  
  safety: {
    emergencySOS: 'SOS Mberede',
    shareTrip: 'Kesaa njem',
    emergencyContacts: 'Ndị ị ga-akpọ na mberede',
    addContact: 'Tinye onye ị ga-akpọ',
    trustedDrivers: 'Ndị ọkwọ ụgbọala a tụkwasịrị obi',
    safetyTips: 'Ndụmọdụ nchekwa',
  },
  
  wallet: {
    balance: 'Ego dị',
    addMoney: 'Tinye ego',
    withdraw: 'Wepụ ego',
    transactions: 'Azụmahịa',
    topUp: 'Gbakwunye ego',
    payment: 'Ịkwụ ụgwọ',
  },
  
  profile: {
    myProfile: 'Profaịlụ m',
    editProfile: 'Dezie profaịlụ',
    personalInfo: 'Ozi onwe gị',
    name: 'Aha',
    email: 'Email',
    phone: 'Ekwentị',
    language: 'Asụsụ',
    changeLanguage: 'Gbanwee asụsụ',
    notifications: 'Ọkwa',
    helpSupport: 'Enyemaka',
  },
  
  verification: {
    driverVerification: 'Nnyocha ọkwọ ụgbọala',
    uploadDocuments: 'Bulite akwụkwọ',
    ninVerified: 'NIN enyochala',
    licenseVerified: 'Akwụkwọ ikike enyochala',
    vehicleVerified: 'Ụgbọala enyochala',
    backgroundCheck: 'Nyocha azụ',
    trustScore: 'Akara ntụkwasị obi',
  },
  
  wellness: {
    driverWellness: 'Ahụ ike ọkwọ ụgbọala',
    takeBreak: 'Were ezumike',
    wellnessScore: 'Akara ahụ ike',
    drivingTime: 'Oge ịnya ụgbọala',
    breakTime: 'Oge ezumike',
    restReminder: 'Oge ezumike!',
    safetyFirst: 'Nchekwa gị bụ ihe mbụ',
  },
  
  smartMode: {
    smartMode: 'Ọnọdụ Amamihe',
    autoAccept: 'Nabata njem n\'onwe gị',
    customizeRules: 'Hazie iwu gị',
    minDistance: 'Anya kacha nta',
    maxDistance: 'Anya kacha ukwuu',
    minRating: 'Akara kacha nta',
    surgePricing: 'Ọnụ ahịa mgbakwunye',
  },
};

// Hausa Translations
export const ha = {
  common: {
    welcome: 'Barka da zuwa',
    hello: 'Sannu',
    thanks: 'Na gode',
    yes: 'Eh',
    no: 'A\'a',
    ok: 'To madalla',
    cancel: 'Soke',
    save: 'Ajiye',
    delete: 'Share',
    edit: 'Gyara',
    loading: 'Ana lodin...',
    error: 'Kuskure',
    success: 'Nasara',
    confirm: 'Tabbatar',
    back: 'Koma',
    next: 'Gaba',
    done: 'An gama',
    search: 'Nema',
    filter: 'Tace',
    settings: 'Saitunan',
  },
  
  auth: {
    login: 'Shiga',
    logout: 'Fita',
    register: 'Yi rajista',
    phoneNumber: 'Lambar waya',
    enterPhone: 'Shigar da lambar wayar ku',
    verifyOTP: 'Tabbatar da lambar',
    enterOTP: 'Shigar da lambar tabbatarwa',
    resendOTP: 'Sake aiko lambar',
    continueText: 'Ci gaba',
  },
  
  home: {
    whereTo: 'Ina kake zuwa?',
    enterDestination: 'Shigar da inda kake zuwa',
    bookRide: 'Yi ajiyar tafiya',
    myTrips: 'Tafiyoyina',
    wallet: 'Walat',
    more: 'Ƙari',
  },
  
  ride: {
    pickupLocation: 'Wurin ɗaukar hawa',
    dropoffLocation: 'Wurin saukowa',
    selectOnMap: 'Zaɓa akan taswira',
    confirmPickup: 'Tabbatar da wurin ɗaukar hawa',
    confirmDropoff: 'Tabbatar da wurin saukowa',
    searchingDriver: 'Ana neman direba...',
    driverFound: 'An sami direba!',
    arrivedPickup: 'Direba ya iso',
    tripStarted: 'Tafiya ta fara',
    tripCompleted: 'Tafiya ta ƙare',
    rateDriver: 'Ku yi wa direba kimanta',
    fare: 'Kuɗin tafiya',
    distance: 'Nesa',
    duration: 'Lokaci',
  },
  
  driver: {
    goOnline: 'Shiga layi',
    goOffline: 'Fita daga layi',
    acceptRide: 'Karɓi tafiya',
    rejectRide: 'Ƙi',
    startTrip: 'Fara tafiya',
    completeTrip: 'Kammala tafiya',
    earnings: 'Abin da ka samu',
    todayEarnings: 'Abin da ka samu yau',
    weeklyEarnings: 'Abin da ka samu mako',
    totalRides: 'Jimlar tafiyoyi',
    rating: 'Kimanta',
  },
  
  safety: {
    emergencySOS: 'SOS Gaggawa',
    shareTrip: 'Raba tafiya',
    emergencyContacts: 'Lambobin gaggawa',
    addContact: 'Ƙara lambar',
    trustedDrivers: 'Direban da aka amince',
    safetyTips: 'Shawarwarin tsaro',
  },
  
  wallet: {
    balance: 'Kuɗin da ke saura',
    addMoney: 'Ƙara kuɗi',
    withdraw: 'Cire kuɗi',
    transactions: 'Mu\'amaloli',
    topUp: 'Ƙara kuɗi',
    payment: 'Biyan kuɗi',
  },
  
  profile: {
    myProfile: 'Bayanan ni',
    editProfile: 'Gyara bayanan',
    personalInfo: 'Bayanan kai',
    name: 'Suna',
    email: 'Imel',
    phone: 'Waya',
    language: 'Harshe',
    changeLanguage: 'Canja harshe',
    notifications: 'Sanarwa',
    helpSupport: 'Taimako',
  },
  
  verification: {
    driverVerification: 'Tabbatar da direba',
    uploadDocuments: 'Loda takaddun',
    ninVerified: 'An tabbatar da NIN',
    licenseVerified: 'An tabbatar da lasisi',
    vehicleVerified: 'An tabbatar da mota',
    backgroundCheck: 'Binciken baya',
    trustScore: 'Matsayin amana',
  },
  
  wellness: {
    driverWellness: 'Lafiyar direba',
    takeBreak: 'Ɗauki hutu',
    wellnessScore: 'Matsayin lafiya',
    drivingTime: 'Lokacin tuƙi',
    breakTime: 'Lokacin hutu',
    restReminder: 'Lokacin hutu!',
    safetyFirst: 'Amincin ka shine farko',
  },
  
  smartMode: {
    smartMode: 'Yanayin Wayo',
    autoAccept: 'Karɓi tafiya kai tsaye',
    customizeRules: 'Saita ka\'idojin ka',
    minDistance: 'Mafi ƙanƙanci nesa',
    maxDistance: 'Mafi girman nesa',
    minRating: 'Mafi ƙanƙanci kimanta',
    surgePricing: 'Ƙarin farashi',
  },
};

// Nigerian Pidgin Translations
export const pcm = {
  common: {
    welcome: 'You welcome',
    hello: 'How far',
    thanks: 'I dey tank you',
    yes: 'Yes na',
    no: 'No be so',
    ok: 'E don do',
    cancel: 'Make you cancel am',
    save: 'Keep am',
    delete: 'Comot am',
    edit: 'Change am',
    loading: 'E dey load...',
    error: 'Wahala don happen',
    success: 'E don work',
    confirm: 'Confam am',
    back: 'Go back',
    next: 'Next one',
    done: 'Done',
    search: 'Find am',
    filter: 'Filter am',
    settings: 'Settings',
  },
  
  auth: {
    login: 'Enter',
    logout: 'Comot',
    register: 'Sign up',
    phoneNumber: 'Phone number',
    enterPhone: 'Put your phone number',
    verifyOTP: 'Check the code',
    enterOTP: 'Put the code wey we send you',
    resendOTP: 'Send code again',
    continueText: 'Make we continue',
  },
  
  home: {
    whereTo: 'Wetin you wan do?',
    enterDestination: 'Where you dey go?',
    bookRide: 'Book ride',
    myTrips: 'My trips dem',
    wallet: 'My money',
    more: 'More thing',
  },
  
  ride: {
    pickupLocation: 'Where we go pick you',
    dropoffLocation: 'Where we go drop you',
    selectOnMap: 'Show us for map',
    confirmPickup: 'Confam where we go pick you',
    confirmDropoff: 'Confam where we go drop you',
    searchingDriver: 'We dey find driver for you...',
    driverFound: 'We don see driver!',
    arrivedPickup: 'Driver don reach',
    tripStarted: 'Journey don start',
    tripCompleted: 'Journey don end',
    rateDriver: 'Rate the driver',
    fare: 'Price',
    distance: 'How far e be',
    duration: 'How long',
  },
  
  driver: {
    goOnline: 'Go online',
    goOffline: 'Go offline',
    acceptRide: 'Accept ride',
    rejectRide: 'Reject am',
    startTrip: 'Start trip',
    completeTrip: 'Finish trip',
    earnings: 'Your money',
    todayEarnings: 'Money wey you make today',
    weeklyEarnings: 'Money for this week',
    totalRides: 'All the trips',
    rating: 'Your rating',
  },
  
  safety: {
    emergencySOS: 'Emergency wahala',
    shareTrip: 'Share trip',
    emergencyContacts: 'People wey go help you',
    addContact: 'Add person',
    trustedDrivers: 'Drivers wey you trust',
    safetyTips: 'Safety tips',
  },
  
  wallet: {
    balance: 'Money wey remain',
    addMoney: 'Add money',
    withdraw: 'Collect money',
    transactions: 'All your money move',
    topUp: 'Add money',
    payment: 'Pay',
  },
  
  profile: {
    myProfile: 'My profile',
    editProfile: 'Change profile',
    personalInfo: 'Your information',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    language: 'Language',
    changeLanguage: 'Change language',
    notifications: 'Notifications',
    helpSupport: 'Help',
  },
  
  verification: {
    driverVerification: 'Driver verification',
    uploadDocuments: 'Upload papers',
    ninVerified: 'NIN don confam',
    licenseVerified: 'License don confam',
    vehicleVerified: 'Motor don confam',
    backgroundCheck: 'Background check',
    trustScore: 'Trust level',
  },
  
  wellness: {
    driverWellness: 'Driver wellness',
    takeBreak: 'Rest small',
    wellnessScore: 'Wellness score',
    drivingTime: 'Time wey you drive',
    breakTime: 'Time wey you rest',
    restReminder: 'Time to rest!',
    safetyFirst: 'Your safety come first',
  },
  
  smartMode: {
    smartMode: 'Smart mode',
    autoAccept: 'Accept ride by yourself',
    customizeRules: 'Set your own rules',
    minDistance: 'Shortest distance',
    maxDistance: 'Longest distance',
    minRating: 'Lowest rating',
    surgePricing: 'Extra price',
  },
};

// Translation type for TypeScript
export type TranslationKeys = typeof en;

// All translations
export const translations = {
  en,
  pcm,
  yo,
  ig,
  ha,
};
