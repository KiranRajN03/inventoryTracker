import React, { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

const translations = {
  en: {
    dashboard: 'Dashboard',
    products: 'Products',
    locations: 'Locations',
    ledger: 'Stock Ledger',
    reports: 'Reports',
    floor: 'Warehouse Floor',
    logout: 'Logout',
    overview: 'Dashboard Overview',
    realtime: 'Real-time inventory metrics and alerts',
    total_stock: 'Total Stock',
    low_stock: 'Low Stock',
    stock_value: 'Stock Value',
    expiring_soon: 'Expiring (30d)',
    recent_activity: 'Recent Operator Activity',
    low_stock_alerts: 'Low Stock Alerts',
    no_activity: 'No recent activity logged',
    units: 'units',
    threshold: 'Threshold'
  },
  hi: {
    dashboard: 'डैशबोर्ड',
    products: 'उत्पाद',
    locations: 'स्थान',
    ledger: 'स्टॉक बहीखाता',
    reports: 'रिपोर्ट',
    floor: 'गोदाम फ्लोर',
    logout: 'लॉगआउट',
    overview: 'डैशबोर्ड अवलोकन',
    realtime: 'वास्तविक समय स्टॉक मेट्रिक्स और अलर्ट',
    total_stock: 'कुल स्टॉक',
    low_stock: 'कम स्टॉक',
    stock_value: 'स्टॉक मूल्य',
    expiring_soon: 'समाप्त होने वाले (30 दिन)',
    recent_activity: 'हाल ही की ऑपरेटर गतिविधि',
    low_stock_alerts: 'कम स्टॉक अलर्ट',
    no_activity: 'कोई हालिया गतिविधि नहीं',
    units: 'यूनिट',
    threshold: 'सीमा'
  },
  kn: {
    dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    products: 'ಉತ್ಪನ್ನಗಳು',
    locations: 'ಸ್ಥಳಗಳು',
    ledger: 'ಸ್ಟಾಕ್ ಲೆಡ್ಜರ್',
    reports: 'ವರದಿಗಳು',
    floor: 'ಗೋದಾಮಿನ ಮಹಡಿ',
    logout: 'ಲಾಗ್ ಔಟ್',
    overview: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಅವಲೋಕನ',
    realtime: 'ನೈಜ-ಸಮยದ ದಾಸ್ತಾನು ಮೆಟ್ರಿಕ್ಸ್ ಮತ್ತು ಎಚ್ಚರಿಕೆಗಳು',
    total_stock: 'ಒಟ್ಟು ಸ್ಟಾಕ್',
    low_stock: 'ಕಡಿಮೆ ಸ್ಟಾಕ್',
    stock_value: 'ಸ್ಟಾಕ್ ಮೌಲ್ಯ',
    expiring_soon: 'ಮುಕ್ತಾಯಗೊಳ್ಳುವ (30 ದಿನ)',
    recent_activity: 'ಇತ್ತೀಚಿನ ಆಪರೇಟರ್ ಚಟುವಟಿಕೆ',
    low_stock_alerts: 'ಕಡಿಮೆ ಸ್ಟಾಕ್ ಎಚ್ಚರಿकेಗಳು',
    no_activity: 'ಯಾವುದೇ ಇತ್ತೀಚಿನ ಚಟುವಟಿಕೆ ಲಾಗ್ ಆಗಿಲ್ಲ',
    units: 'ಘಟಕಗಳು',
    threshold: 'ಮಿತಿ'
  },
  ta: {
    dashboard: 'டாஷ்போர்டு',
    products: 'தயாரிப்புகள்',
    locations: 'இருப்பிடங்கள்',
    ledger: 'இருப்பு பேரேடு',
    reports: 'அறிக்கைகள்',
    floor: 'கிடங்கு தளம்',
    logout: 'வெளியேறு',
    overview: 'டாஷ்போர்டு கண்ணோட்டம்',
    realtime: 'நிகழ்நேர சரக்கு அளவீடுகள் மற்றும் எச்சரிக்கைகள்',
    total_stock: 'மொத்த இருப்பு',
    low_stock: 'குறைந்த இருப்பு',
    stock_value: 'இருப்பு மதிப்பு',
    expiring_soon: 'காலாவதியாகும் (30நாட்கள்)',
    recent_activity: 'சமீபத்திய ஆபరేட்டர் செயல்பாடு',
    low_stock_alerts: 'குறைந்த இருப்பு எச்சரிக்கைகள்',
    no_activity: 'சமீபத்திய செயல்பாடுகள் இல்லை',
    units: 'அலகுகள்',
    threshold: 'வரம்பு'
  },
  te: {
    dashboard: 'డ్యాష్‌బోర్డ్',
    products: 'ఉత్పత్తులు',
    locations: 'స్థానాలు',
    ledger: 'స్టాక్ లెడ్జర్',
    reports: 'నివేదికలు',
    floor: 'వేర్‌హౌస్ ఫ్లోర్',
    logout: 'లాగౌట్',
    overview: 'డ్యాష్‌బోర్డ్ అవలోకనం',
    realtime: 'నిజ-సమయ ఇన్వెنتరీ కొలతలు మరియు హెచ్చరికలు',
    total_stock: 'మొత్తం స్టాక్',
    low_stock: 'తక్కువ స్టాక్',
    stock_value: 'స్టాक విలువ',
    expiring_soon: 'గడువు ముగిసేవి (30 రోజులు)',
    recent_activity: 'ఇటీవలి ఆపరేటర్ కార్యాచరణ',
    low_stock_alerts: 'తక్కువ స్టాక్ హెచ్చరికలు',
    no_activity: 'ఇటీవలి కార్యాచరణ ఏదీ నమోదు కాలేదు',
    units: 'యూనిట్లు',
    threshold: 'పరిమితి'
  },
  mr: {
    dashboard: 'डॅशबोर्ड',
    products: 'उत्पादने',
    locations: 'स्थाने',
    ledger: 'स्टॉक लेजर',
    reports: 'अहवाल',
    floor: 'वेअरहाउस फ्लोर',
    logout: 'लॉगआउट',
    overview: 'डॅशबोर्ड विहंगावलोकन',
    realtime: 'रिअल-टाइम इन्व्हेंटरी मेट्रिक्स आणि अलर्ट',
    total_stock: 'एकूण स्टॉक',
    low_stock: 'कमी स्टॉक',
    stock_value: 'स्टॉक मूल्य',
    expiring_soon: 'कालबाह्य होणारे (३० दिवस)',
    recent_activity: 'अलीकडील ऑपरेटर क्रियाकलाप',
    low_stock_alerts: 'कमी स्टॉक अलर्ट',
    no_activity: 'कोणतीही अलीकडील क्रियाकलाप नोंदवलेली नाही',
    units: 'युनिट्स',
    threshold: 'मर्यादा'
  }
};

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  const t = (key) => {
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);
