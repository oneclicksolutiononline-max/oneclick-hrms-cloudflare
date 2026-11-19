/* THE EMPLOYEE'S "I AGREE" BEFORE HIS FACE IS REGISTERED (18-11-2026, Phase 1 – the master prompt: "Add biometric consent records …
 * Obtain and record appropriate notice/consent"). The words are kept HERE, on the server, so the phone shows exactly the words that
 * are in force; their VERSION is made from the words themselves – a change of a word is a new version, and what a person agreed to
 * is always known (hr_face_consents: version, language, phone, when). A lawyer reads the words before the face check is used widely
 * (the master prompt: "Review applicable Indian data protection and employment requirements before production launch"). */
'use strict';
const crypto = require('crypto');

const TEXT = {
  en: {
    title: 'Your face for attendance – your consent',
    points: [
      'RCL HR uses your face only to confirm that it is you who marks your attendance.',
      'What is kept: five pictures taken now and numbers measured from them (a face template). At every sign-in and sign-out a photo is taken and compared with these numbers.',
      'Who sees it: the pictures – only the HR Admin and the Super Admin of your site. The numbers – nobody; only the HR server compares them.',
      'It is used for nothing else: not to judge mood, character, caste, religion or anything else. It is never sold or shared.',
      'How long: your face template and pictures are erased when you leave the company. Sign-in photos are removed after 90 days (longer only while an investigation needs them).',
      'Where your site checks the face, attendance cannot be marked without a registered face. Ask your HR office if you have a question.'],
    agree: 'I agree that my face is registered and used for my attendance as written above.' },
  mr: {
    title: 'हजेरीसाठी तुमचा चेहरा – तुमची संमती',
    points: [
      'हजेरी तुम्हीच लावत आहात याची खात्री करण्यासाठीच RCL HR तुमचा चेहरा वापरते.',
      'काय ठेवलं जातं: आता काढलेले पाच फोटो आणि त्यावरून मोजलेले आकडे (face template). प्रत्येक sign-in आणि sign-out ला एक फोटो काढून या आकड्यांशी जुळवला जातो.',
      'कोण पाहू शकतं: फोटो – फक्त तुमच्या site चे HR Admin आणि Super Admin. आकडे – कोणीच नाही; फक्त HR server ते जुळवतो.',
      'याचा दुसरा कोणताही उपयोग होत नाही: मूड, स्वभाव, जात, धर्म किंवा इतर काहीही ठरवण्यासाठी नाही. हे कधीही विकलं किंवा कुणाला दिलं जात नाही.',
      'किती दिवस: तुम्ही कंपनी सोडल्यावर तुमचा face template आणि फोटो पुसले जातात. Sign-in चे फोटो 90 दिवसांनी काढून टाकले जातात (चौकशीसाठी गरज असेल तेव्हाच जास्त काळ).',
      'ज्या site वर चेहरा तपासला जातो तिथे नोंदवलेल्या चेहऱ्याशिवाय हजेरी लागत नाही. काही प्रश्न असेल तर तुमच्या HR office ला विचारा.'],
    agree: 'वर लिहिल्याप्रमाणे माझा चेहरा नोंदवून माझ्या हजेरीसाठी वापरण्यास माझी संमती आहे.' },
  hi: {
    title: 'हाज़िरी के लिए आपका चेहरा – आपकी सहमति',
    points: [
      'हाज़िरी आप ही लगा रहे हैं, यह पक्का करने के लिए ही RCL HR आपका चेहरा इस्तेमाल करता है.',
      'क्या रखा जाता है: अभी लिए गए पाँच फोटो और उनसे मापे गए अंक (face template). हर sign-in और sign-out पर एक फोटो लेकर इन अंकों से मिलाया जाता है.',
      'कौन देख सकता है: फोटो – सिर्फ़ आपकी site के HR Admin और Super Admin. अंक – कोई नहीं; सिर्फ़ HR server उन्हें मिलाता है.',
      'इसका और कोई इस्तेमाल नहीं होता: मूड, स्वभाव, जाति, धर्म या कुछ और तय करने के लिए नहीं. यह कभी बेचा या किसी को दिया नहीं जाता.',
      'कितने दिन: आप कंपनी छोड़ते हैं तो आपका face template और फोटो मिटा दिए जाते हैं. Sign-in के फोटो 90 दिन बाद हटा दिए जाते हैं (जाँच के लिए ज़रूरत हो तभी ज़्यादा समय).',
      'जिस site पर चेहरा जाँचा जाता है, वहाँ दर्ज चेहरे के बिना हाज़िरी नहीं लगती. कोई सवाल हो तो अपने HR office से पूछें.'],
    agree: 'ऊपर लिखे अनुसार मेरा चेहरा दर्ज करके मेरी हाज़िरी के लिए इस्तेमाल करने की मेरी सहमति है.' },
};
const VERSION = 'f1-' + crypto.createHash('sha256').update(JSON.stringify(TEXT)).digest('hex').slice(0, 10);
const LANGS = Object.keys(TEXT);
const required = () => String(process.env.FACE_CONSENT_REQUIRED || '') === 'true';
module.exports = { TEXT, VERSION, LANGS, required };
