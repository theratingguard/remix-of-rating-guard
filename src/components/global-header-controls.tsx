import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Globe2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Language = "en" | "hi" | "mr";
type NotificationTarget = "/chat" | "/admin/staff" | "/reports" | "/client/reports";
type HeaderNotification = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  target: NotificationTarget;
};
type NotificationSource = {
  items: HeaderNotification[];
  errors: string[];
};

const languages: { id: Language; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "hi", label: "Hindi", native: "हिन्दी" },
  { id: "mr", label: "Marathi", native: "मराठी" },
];

const translations: Record<Exclude<Language, "en">, Record<string, string>> = {
  hi: {
    Dashboard: "डैशबोर्ड",
    "URL Scanner": "URL स्कैनर",
    "Bulk URL Scan": "बल्क URL स्कैन",
    "Google Reviews": "Google समीक्षाएँ",
    "Risk Analysis": "जोखिम विश्लेषण",
    "Scan History": "स्कैन इतिहास",
    Reports: "रिपोर्ट",
    "Storage Manager": "स्टोरेज प्रबंधक",
    Settings: "सेटिंग्स",
    "Staff Approvals": "स्टाफ़ अनुमोदन",
    Resellers: "रीसेलर",
    "Staff Activity": "स्टाफ़ गतिविधि",
    Overview: "अवलोकन",
    "My Tasks": "मेरे कार्य",
    "Status Board": "स्थिति बोर्ड",
    Performance: "प्रदर्शन",
    Quality: "गुणवत्ता",
    Incentive: "प्रोत्साहन",
    Communication: "संचार",
    "My Activity": "मेरी गतिविधि",
    "Evidence Vault": "साक्ष्य संग्रह",
    Timeline: "समयरेखा",
    "Team Review": "टीम समीक्षा",
    Alerts: "अलर्ट",
    Profile: "प्रोफ़ाइल",
    Chats: "चैट",
    "Review Outcomes": "समीक्षा परिणाम",
    "Scan & Remove": "स्कैन और हटाएँ",
    "Settings / Profile": "सेटिंग्स / प्रोफ़ाइल",
    "Open menu": "मेनू खोलें",
    "Log out": "लॉग आउट",
    "Language / भाषा": "भाषा",
    Notifications: "सूचनाएँ",
    "No new notifications": "कोई नई सूचना नहीं",
    "Loading notifications…": "सूचनाएँ लोड हो रही हैं…",
    "Could not load notifications": "सूचनाएँ लोड नहीं हो सकीं",
    "New chat message": "नया चैट संदेश",
    "New staff registration": "नया स्टाफ़ पंजीकरण",
    "New report submitted": "नई रिपोर्ट जमा हुई",
    "View all notifications": "सभी सूचनाएँ देखें",
    "Your overview": "आपका अवलोकन",
    "Track review scans, prepared reports, and confirmed outcomes.":
      "समीक्षा स्कैन, तैयार रिपोर्ट और पुष्ट परिणाम देखें।",
    "New scan": "नया स्कैन",
    "Dashboard data could not be loaded. Please refresh the page.":
      "डैशबोर्ड डेटा लोड नहीं हुआ। कृपया पेज फिर से खोलें।",
    "Review statistics": "समीक्षा आँकड़े",
    "Reviews scanned": "स्कैन की गई समीक्षाएँ",
    "1–2 star reviews": "1–2 स्टार समीक्षाएँ",
    "Reports submitted": "जमा की गई रिपोर्टें",
    "Successful removals": "सफलतापूर्वक हटाई गईं",
    "Recent activity": "हाल की गतिविधि",
    "Your latest business review scans": "आपके नवीनतम व्यावसायिक समीक्षा स्कैन",
    Date: "तारीख",
    Business: "व्यवसाय",
    Action: "कार्रवाई",
    Status: "स्थिति",
    "No scans yet": "अभी तक कोई स्कैन नहीं",
    "Start with a Google Maps business or review link.":
      "Google Maps व्यवसाय या समीक्षा लिंक से शुरू करें।",
    "Start your first scan": "अपना पहला स्कैन शुरू करें",
    "Your documents": "आपके दस्तावेज़",
    "Review report drafts, decision status, and saved assessment PDFs.":
      "रिपोर्ट ड्राफ़्ट, निर्णय की स्थिति और सहेजी गई आकलन PDF देखें।",
    "Search business or report": "व्यवसाय या रिपोर्ट खोजें",
    "Search reports by business name": "व्यवसाय के नाम से रिपोर्ट खोजें",
    "Loading reports": "रिपोर्ट लोड हो रही हैं",
    "Reports could not be loaded. Please refresh and try again.":
      "रिपोर्ट लोड नहीं हुईं। कृपया पेज रीफ़्रेश करके फिर कोशिश करें।",
    "No matching reports": "कोई मिलती-जुलती रिपोर्ट नहीं",
    "No reports yet": "अभी तक कोई रिपोर्ट नहीं",
    "Try another business name.": "कोई दूसरा व्यवसाय नाम खोजें।",
    "Reports appear here after your first scan.": "पहले स्कैन के बाद रिपोर्ट यहाँ दिखाई देंगी।",
    Document: "दस्तावेज़",
    "Download PDF": "PDF डाउनलोड करें",
    "PDF not available": "PDF उपलब्ध नहीं है",
    "Showing {start}–{end} of {total} reports":
      "{total} में से {start}–{end} रिपोर्टें दिखाई जा रही हैं",
    Previous: "पिछला",
    Next: "अगला",
    "Account preferences": "खाता प्राथमिकताएँ",
    "Manage the profile and sign-in details for your client account.":
      "अपने क्लाइंट खाते की प्रोफ़ाइल और साइन-इन विवरण प्रबंधित करें।",
    "Profile information could not be loaded. Please refresh.":
      "प्रोफ़ाइल जानकारी लोड नहीं हुई। कृपया रीफ़्रेश करें।",
    "Basic profile": "मूल प्रोफ़ाइल",
    "Your name and account email": "आपका नाम और खाता ईमेल",
    Name: "नाम",
    Email: "ईमेल",
    "Email changes are managed by support.": "ईमेल परिवर्तन सहायता टीम द्वारा किए जाते हैं।",
    "Save profile": "प्रोफ़ाइल सहेजें",
    "Change password": "पासवर्ड बदलें",
    "Choose a strong password you do not reuse.":
      "ऐसा मज़बूत पासवर्ड चुनें जिसका दोबारा उपयोग न हो।",
    "Current password": "वर्तमान पासवर्ड",
    "New password": "नया पासवर्ड",
    "Confirm new password": "नए पासवर्ड की पुष्टि करें",
    "Update password": "पासवर्ड अपडेट करें",
    "Client workspace": "क्लाइंट कार्यक्षेत्र",
    "Could not sign out. Please try again.": "साइन आउट नहीं हो सका। कृपया फिर कोशिश करें।",
    "Enter a valid Google Maps business or review URL.":
      "मान्य Google Maps व्यवसाय या समीक्षा URL दर्ज करें।",
    "Enter a valid Google Maps URL.": "मान्य Google Maps URL दर्ज करें।",
    "The scan could not be completed. Please try again.":
      "स्कैन पूरा नहीं हो सका। कृपया फिर कोशिश करें।",
    "A connection issue stopped the scan. Please try again.":
      "कनेक्शन समस्या के कारण स्कैन रुक गया। कृपया फिर कोशिश करें।",
    "Could not prepare this report.": "यह रिपोर्ट तैयार नहीं हो सकी।",
    "Scan & review": "स्कैन और समीक्षा",
    "Find review issues": "समीक्षा की समस्याएँ खोजें",
    "Enter a Google Maps business or review link. We’ll assess available reviews for potential policy concerns.":
      "Google Maps व्यवसाय या समीक्षा लिंक दर्ज करें। हम संभावित नीति समस्याओं के लिए उपलब्ध समीक्षाओं का आकलन करेंगे।",
    "Google Maps URL": "Google Maps URL",
    "https://maps.google.com/…": "https://maps.google.com/…",
    "Start scan": "स्कैन शुरू करें",
    "Only public Google Maps business or review links are supported.":
      "केवल सार्वजनिक Google Maps व्यवसाय या समीक्षा लिंक समर्थित हैं।",
    "Scan progress": "स्कैन प्रगति",
    "Scan results could not be loaded. Please refresh.":
      "स्कैन परिणाम लोड नहीं हुए। कृपया रीफ़्रेश करें।",
    "Flagged reviews": "चिह्नित समीक्षाएँ",
    "Low ratings alone do not prove a policy violation; review each assessment carefully.":
      "कम रेटिंग अपने आप में नीति उल्लंघन का प्रमाण नहीं है; हर आकलन ध्यान से देखें।",
    "No 1- or 2-star reviews were found in the available scan results.":
      "उपलब्ध स्कैन में 1 या 2 स्टार की समीक्षा नहीं मिली।",
    "Assessment reason": "आकलन का कारण",
    "Preparing a draft does not submit a report to Google. A person must review and submit it through Google’s official process.":
      "ड्राफ़्ट तैयार करने से Google को रिपोर्ट जमा नहीं होती। किसी व्यक्ति को Google की आधिकारिक प्रक्रिया से समीक्षा करके जमा करना होगा।",
    "Start a scan": "स्कैन शुरू करें",
    "Reseller profile could not be loaded. Confirm your account has the reseller role, then refresh.":
      "रीसेलर प्रोफ़ाइल लोड नहीं हुई। पुष्टि करें कि खाते में रीसेलर भूमिका है, फिर रीफ़्रेश करें।",
    "Referrals are recorded when a client account is created with this code. Commission amounts are set and approved by the Superadmin; no amount is assumed or automatically paid.":
      "इस कोड से क्लाइंट खाता बनने पर रेफ़रल दर्ज होता है। कमीशन राशि सुपर एडमिन तय और स्वीकृत करता है; कोई राशि स्वतः तय या भुगतान नहीं होती।",
    "Scanning is temporarily unavailable. Please try again shortly.":
      "स्कैनिंग अभी उपलब्ध नहीं है। थोड़ी देर बाद फिर कोशिश करें।",
    "We could not retrieve reviews for this link. Check the URL and try again.":
      "इस लिंक से समीक्षाएँ नहीं मिल सकीं। URL जाँचकर फिर कोशिश करें।",
    "Review analysis could not be completed. Please try again.":
      "समीक्षा विश्लेषण पूरा नहीं हुआ। कृपया फिर कोशिश करें।",
    "Scan complete. Review the flagged items below.": "स्कैन पूरा हुआ। नीचे चिह्नित आइटम देखें।",
    "Fetching reviews": "समीक्षाएँ प्राप्त की जा रही हैं",
    "AI analysis": "AI विश्लेषण",
    Done: "पूरा हुआ",
    "Your review assessment is ready.": "आपका समीक्षा आकलन तैयार है।",
    "The scan stopped before completion.": "स्कैन पूरा होने से पहले रुक गया।",
    "This may take a few minutes while reviews are assessed.":
      "समीक्षाओं के आकलन में कुछ मिनट लग सकते हैं।",
    "High concern": "गंभीर चिंता",
    "Needs review": "समीक्षा आवश्यक",
    Review: "समीक्षा",
    "Google reviewer": "Google समीक्षक",
    "No review text was provided.": "समीक्षा का कोई पाठ उपलब्ध नहीं है।",
    "This review does not have a validated reporting signal.":
      "इस समीक्षा के लिए रिपोर्टिंग संकेत सत्यापित नहीं है।",
    "Draft pending": "ड्राफ़्ट लंबित",
    "Prepare report": "रिपोर्ट तैयार करें",
    Pending: "लंबित",
    Removed: "हटाया गया",
    Rejected: "अस्वीकृत",
    Completed: "पूरा हुआ",
    Failed: "विफल",
    Scanned: "स्कैन किया गया",
    Report: "रिपोर्ट",
    "Report draft saved as pending. It has not been submitted to Google.":
      "रिपोर्ट ड्राफ़्ट लंबित के रूप में सहेजा गया। इसे Google को जमा नहीं किया गया है।",
    "Your message could not be sent. Please try again.":
      "आपका संदेश भेजा नहीं जा सका। कृपया फिर कोशिश करें।",
    "Support chat is not available right now.": "सहायता चैट अभी उपलब्ध नहीं है।",
    Online: "ऑनलाइन",
    Offline: "ऑफ़लाइन",
    "Show conversations": "बातचीत दिखाएँ",
    "Locked evidence message": "लॉक किया गया साक्ष्य संदेश",
    "Edit and audit message": "संदेश संपादित और ऑडिट करें",
    "Message updated; the original is preserved in the audit.":
      "संदेश अपडेट हुआ; मूल संदेश ऑडिट में सुरक्षित है।",
    "Remove message from user view": "उपयोगकर्ता दृश्य से संदेश हटाएँ",
    "Message hidden from user view and preserved in the audit.":
      "संदेश उपयोगकर्ता से छिपाया गया और ऑडिट में सुरक्षित है।",
    "Write a message…": "संदेश लिखें…",
    "Send message": "संदेश भेजें",
    "Partner workspace": "साझेदार कार्यक्षेत्र",
    "Reseller dashboard": "रीसेलर डैशबोर्ड",
    "Track referrals and commission updates from your Rating Guard account.":
      "अपने Rating Guard खाते से रेफ़रल और कमीशन अपडेट देखें।",
    "Chat with Superadmin": "सुपर एडमिन से चैट करें",
    "Referred accounts": "रेफ़र किए गए खाते",
    "Approved / paid commission": "स्वीकृत / भुगतान किया गया कमीशन",
    "Your referral code": "आपका रेफ़रल कोड",
    "Share this invite link with a new client to register with your code attached.":
      "नए क्लाइंट के साथ यह आमंत्रण लिंक साझा करें ताकि आपका कोड जुड़ जाए।",
    "Copy client invite link": "क्लाइंट आमंत्रण लिंक कॉपी करें",
    "Unique mobile number": "अद्वितीय मोबाइल नंबर",
    "Your number is private and must not already belong to another reseller.":
      "आपका नंबर निजी है और किसी अन्य रीसेलर के पास नहीं होना चाहिए।",
    Mobile: "मोबाइल",
    "Save mobile number": "मोबाइल नंबर सहेजें",
    "Referral & commission history": "रेफ़रल और कमीशन इतिहास",
    "Only your own referral records are visible here.": "यहाँ केवल आपके रेफ़रल रिकॉर्ड दिखते हैं।",
    Joined: "शामिल हुए",
    Account: "खाता",
    Commission: "कमीशन",
    "No referrals have been recorded yet.": "अभी तक कोई रेफ़रल दर्ज नहीं हुआ है।",
    "Enter a valid mobile number.": "मान्य मोबाइल नंबर दर्ज करें।",
    "That mobile number is already in use.": "यह मोबाइल नंबर पहले से उपयोग में है।",
    "Could not save your number.": "आपका नंबर सहेजा नहीं जा सका।",
    "Mobile number saved.": "मोबाइल नंबर सहेजा गया।",
    "Client invite link copied.": "क्लाइंट आमंत्रण लिंक कॉपी किया गया।",
    "Could not copy the referral code. Select and copy it instead.":
      "रेफ़रल कोड कॉपी नहीं हुआ। उसे चुनकर कॉपी करें।",
  },
  mr: {
    Dashboard: "डॅशबोर्ड",
    "URL Scanner": "URL स्कॅनर",
    "Bulk URL Scan": "बल्क URL स्कॅन",
    "Google Reviews": "Google पुनरावलोकने",
    "Risk Analysis": "जोखीम विश्लेषण",
    "Scan History": "स्कॅन इतिहास",
    Reports: "अहवाल",
    "Storage Manager": "स्टोरेज व्यवस्थापक",
    Settings: "सेटिंग्ज",
    "Staff Approvals": "कर्मचारी मंजुरी",
    Resellers: "रीसेलर",
    "Staff Activity": "कर्मचारी क्रियाकलाप",
    Overview: "आढावा",
    "My Tasks": "माझी कामे",
    "Status Board": "स्थिती फलक",
    Performance: "कामगिरी",
    Quality: "गुणवत्ता",
    Incentive: "प्रोत्साहन",
    Communication: "संवाद",
    "My Activity": "माझे क्रियाकलाप",
    "Evidence Vault": "पुरावा संग्रह",
    Timeline: "वेळापत्रक",
    "Team Review": "संघ पुनरावलोकन",
    Alerts: "सूचना",
    Profile: "प्रोफाइल",
    Chats: "चॅट",
    "Review Outcomes": "पुनरावलोकन परिणाम",
    "Scan & Remove": "स्कॅन आणि काढा",
    "Settings / Profile": "सेटिंग्ज / प्रोफाइल",
    "Open menu": "मेनू उघडा",
    "Log out": "बाहेर पडा",
    "Language / भाषा": "भाषा",
    Notifications: "सूचना",
    "No new notifications": "नवीन सूचना नाहीत",
    "Loading notifications…": "सूचना लोड होत आहेत…",
    "Could not load notifications": "सूचना लोड होऊ शकल्या नाहीत",
    "New chat message": "नवीन चॅट संदेश",
    "New staff registration": "नवीन कर्मचारी नोंदणी",
    "New report submitted": "नवीन अहवाल सादर",
    "View all notifications": "सर्व सूचना पहा",
    "Your overview": "तुमचा आढावा",
    "Track review scans, prepared reports, and confirmed outcomes.":
      "पुनरावलोकन स्कॅन, तयार अहवाल आणि निश्चित परिणाम पहा.",
    "New scan": "नवीन स्कॅन",
    "Dashboard data could not be loaded. Please refresh the page.":
      "डॅशबोर्ड माहिती लोड झाली नाही. कृपया पान रीफ्रेश करा.",
    "Review statistics": "पुनरावलोकन आकडेवारी",
    "Reviews scanned": "स्कॅन केलेली पुनरावलोकने",
    "1–2 star reviews": "1–2 स्टार पुनरावलोकने",
    "Reports submitted": "सादर केलेले अहवाल",
    "Successful removals": "यशस्वीपणे काढलेले",
    "Recent activity": "अलीकडील क्रियाकलाप",
    "Your latest business review scans": "तुमचे अलीकडील व्यवसाय पुनरावलोकन स्कॅन",
    Date: "तारीख",
    Business: "व्यवसाय",
    Action: "कृती",
    Status: "स्थिती",
    "No scans yet": "अजून स्कॅन नाहीत",
    "Start with a Google Maps business or review link.":
      "Google Maps व्यवसाय किंवा पुनरावलोकन लिंकने सुरुवात करा.",
    "Start your first scan": "तुमचा पहिला स्कॅन सुरू करा",
    "Your documents": "तुमची कागदपत्रे",
    "Review report drafts, decision status, and saved assessment PDFs.":
      "अहवाल मसुदे, निर्णय स्थिती आणि जतन केलेल्या PDF पहा.",
    "Search business or report": "व्यवसाय किंवा अहवाल शोधा",
    "Search reports by business name": "व्यवसायाच्या नावाने अहवाल शोधा",
    "Loading reports": "अहवाल लोड होत आहेत",
    "Reports could not be loaded. Please refresh and try again.":
      "अहवाल लोड झाले नाहीत. कृपया रीफ्रेश करून पुन्हा प्रयत्न करा.",
    "No matching reports": "जुळणारे अहवाल नाहीत",
    "No reports yet": "अजून अहवाल नाहीत",
    "Try another business name.": "दुसरे व्यवसायाचे नाव वापरून पहा.",
    "Reports appear here after your first scan.": "पहिल्या स्कॅननंतर अहवाल येथे दिसतील.",
    Document: "कागदपत्र",
    "Download PDF": "PDF डाउनलोड करा",
    "PDF not available": "PDF उपलब्ध नाही",
    "Showing {start}–{end} of {total} reports": "{total} पैकी {start}–{end} अहवाल दाखवत आहे",
    Previous: "मागील",
    Next: "पुढील",
    "Account preferences": "खाते प्राधान्ये",
    "Manage the profile and sign-in details for your client account.":
      "तुमच्या क्लायंट खात्याची प्रोफाइल आणि साइन-इन माहिती व्यवस्थापित करा.",
    "Profile information could not be loaded. Please refresh.":
      "प्रोफाइल माहिती लोड झाली नाही. कृपया रीफ्रेश करा.",
    "Basic profile": "मूलभूत प्रोफाइल",
    "Your name and account email": "तुमचे नाव आणि खाते ईमेल",
    Name: "नाव",
    Email: "ईमेल",
    "Email changes are managed by support.": "ईमेल बदल सहाय्य पथकाद्वारे व्यवस्थापित केले जातात.",
    "Save profile": "प्रोफाइल जतन करा",
    "Change password": "पासवर्ड बदला",
    "Choose a strong password you do not reuse.": "पुन्हा वापरत नसलेला मजबूत पासवर्ड निवडा.",
    "Current password": "सध्याचा पासवर्ड",
    "New password": "नवीन पासवर्ड",
    "Confirm new password": "नवीन पासवर्डची पुष्टी करा",
    "Update password": "पासवर्ड अद्ययावत करा",
    "Client workspace": "क्लायंट कार्यक्षेत्र",
    "Could not sign out. Please try again.": "साइन आउट करता आले नाही. कृपया पुन्हा प्रयत्न करा.",
    "Enter a valid Google Maps business or review URL.":
      "वैध Google Maps व्यवसाय किंवा पुनरावलोकन URL द्या.",
    "Enter a valid Google Maps URL.": "वैध Google Maps URL द्या.",
    "The scan could not be completed. Please try again.":
      "स्कॅन पूर्ण करता आला नाही. कृपया पुन्हा प्रयत्न करा.",
    "A connection issue stopped the scan. Please try again.":
      "कनेक्शन समस्येमुळे स्कॅन थांबला. कृपया पुन्हा प्रयत्न करा.",
    "Could not prepare this report.": "हा अहवाल तयार करता आला नाही.",
    "Scan & review": "स्कॅन आणि पुनरावलोकन",
    "Find review issues": "पुनरावलोकनातील समस्या शोधा",
    "Enter a Google Maps business or review link. We’ll assess available reviews for potential policy concerns.":
      "Google Maps व्यवसाय किंवा पुनरावलोकन लिंक द्या. संभाव्य धोरण समस्यांसाठी उपलब्ध पुनरावलोकनांचे मूल्यांकन करू.",
    "Google Maps URL": "Google Maps URL",
    "https://maps.google.com/…": "https://maps.google.com/…",
    "Start scan": "स्कॅन सुरू करा",
    "Only public Google Maps business or review links are supported.":
      "फक्त सार्वजनिक Google Maps व्यवसाय किंवा पुनरावलोकन लिंक समर्थित आहेत.",
    "Scan progress": "स्कॅन प्रगती",
    "Scan results could not be loaded. Please refresh.":
      "स्कॅन परिणाम लोड झाले नाहीत. कृपया रीफ्रेश करा.",
    "Flagged reviews": "चिन्हांकित पुनरावलोकने",
    "Low ratings alone do not prove a policy violation; review each assessment carefully.":
      "कमी रेटिंग म्हणजे धोरण उल्लंघनाचा पुरावा नाही; प्रत्येक मूल्यांकन काळजीपूर्वक पहा.",
    "No 1- or 2-star reviews were found in the available scan results.":
      "उपलब्ध स्कॅनमध्ये 1 किंवा 2 स्टार पुनरावलोकने आढळली नाहीत.",
    "Assessment reason": "मूल्यांकनाचे कारण",
    "Preparing a draft does not submit a report to Google. A person must review and submit it through Google’s official process.":
      "मसुदा तयार केल्याने Google कडे अहवाल सादर होत नाही. व्यक्तीने Google च्या अधिकृत प्रक्रियेद्वारे तपासून सादर करणे आवश्यक आहे.",
    "Start a scan": "स्कॅन सुरू करा",
    "Reseller profile could not be loaded. Confirm your account has the reseller role, then refresh.":
      "रीसेलर प्रोफाइल लोड झाले नाही. खात्यात रीसेलर भूमिका असल्याची खात्री करून रीफ्रेश करा.",
    "Referrals are recorded when a client account is created with this code. Commission amounts are set and approved by the Superadmin; no amount is assumed or automatically paid.":
      "या कोडने क्लायंट खाते तयार झाल्यावर रेफरल नोंदवले जाते. कमिशनची रक्कम सुपरॲडमिन ठरवतो व मंजूर करतो; कोणतीही रक्कम आपोआप ठरत किंवा दिली जात नाही.",
    "Scanning is temporarily unavailable. Please try again shortly.":
      "स्कॅनिंग सध्या उपलब्ध नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.",
    "We could not retrieve reviews for this link. Check the URL and try again.":
      "या लिंकवरील पुनरावलोकने मिळाली नाहीत. URL तपासून पुन्हा प्रयत्न करा.",
    "Review analysis could not be completed. Please try again.":
      "पुनरावलोकन विश्लेषण पूर्ण झाले नाही. कृपया पुन्हा प्रयत्न करा.",
    "Scan complete. Review the flagged items below.": "स्कॅन पूर्ण झाला. खाली चिन्हांकित बाबी पहा.",
    "Fetching reviews": "पुनरावलोकने मिळवत आहे",
    "AI analysis": "AI विश्लेषण",
    Done: "पूर्ण",
    "Your review assessment is ready.": "तुमचे पुनरावलोकन मूल्यांकन तयार आहे.",
    "The scan stopped before completion.": "पूर्ण होण्यापूर्वी स्कॅन थांबला.",
    "This may take a few minutes while reviews are assessed.":
      "पुनरावलोकनांचे मूल्यांकन होण्यासाठी काही मिनिटे लागू शकतात.",
    "High concern": "गंभीर चिंता",
    "Needs review": "पुनरावलोकन आवश्यक",
    Review: "पुनरावलोकन",
    "Google reviewer": "Google पुनरावलोकनकर्ता",
    "No review text was provided.": "पुनरावलोकनाचा मजकूर दिलेला नाही.",
    "This review does not have a validated reporting signal.":
      "या पुनरावलोकनासाठी अहवाल संकेत सत्यापित नाही.",
    "Draft pending": "मसुदा प्रलंबित",
    Pending: "प्रलंबित",
    Removed: "काढले",
    Rejected: "नाकारले",
    Completed: "पूर्ण",
    Failed: "अयशस्वी",
    Scanned: "स्कॅन केले",
    Report: "अहवाल",
    "Prepare report": "अहवाल तयार करा",
    "Report draft saved as pending. It has not been submitted to Google.":
      "अहवालाचा मसुदा प्रलंबित म्हणून जतन केला. तो Google कडे सादर केलेला नाही.",
    "Your message could not be sent. Please try again.":
      "तुमचा संदेश पाठवता आला नाही. कृपया पुन्हा प्रयत्न करा.",
    "Support chat is not available right now.": "सहाय्य चॅट सध्या उपलब्ध नाही.",
    Online: "ऑनलाइन",
    Offline: "ऑफलाइन",
    "Show conversations": "संभाषणे दाखवा",
    "Locked evidence message": "लॉक केलेला पुरावा संदेश",
    "Edit and audit message": "संदेश संपादित करा आणि ऑडिट करा",
    "Message updated; the original is preserved in the audit.":
      "संदेश अद्ययावत; मूळ संदेश ऑडिटमध्ये जतन आहे.",
    "Remove message from user view": "वापरकर्त्याच्या दृश्यातून संदेश काढा",
    "Message hidden from user view and preserved in the audit.":
      "संदेश वापरकर्त्यापासून लपवला आणि ऑडिटमध्ये जतन केला.",
    "Write a message…": "संदेश लिहा…",
    "Send message": "संदेश पाठवा",
    "Partner workspace": "भागीदार कार्यक्षेत्र",
    "Reseller dashboard": "रीसेलर डॅशबोर्ड",
    "Track referrals and commission updates from your Rating Guard account.":
      "तुमच्या Rating Guard खात्यातून रेफरल आणि कमिशन अद्यतने पहा.",
    "Chat with Superadmin": "सुपरॲडमिनशी चॅट करा",
    "Referred accounts": "रेफर केलेली खाती",
    "Approved / paid commission": "मंजूर / दिलेले कमिशन",
    "Your referral code": "तुमचा रेफरल कोड",
    "Share this invite link with a new client to register with your code attached.":
      "तुमचा कोड जोडून नोंदणीसाठी ही आमंत्रण लिंक नवीन क्लायंटसोबत शेअर करा.",
    "Copy client invite link": "क्लायंट आमंत्रण लिंक कॉपी करा",
    "Unique mobile number": "अद्वितीय मोबाइल नंबर",
    "Your number is private and must not already belong to another reseller.":
      "तुमचा नंबर खाजगी आहे आणि दुसऱ्या रीसेलरकडे नसावा.",
    Mobile: "मोबाइल",
    "Save mobile number": "मोबाइल नंबर जतन करा",
    "Referral & commission history": "रेफरल आणि कमिशन इतिहास",
    "Only your own referral records are visible here.": "येथे फक्त तुमचे रेफरल रेकॉर्ड दिसतात.",
    Joined: "सामील झाले",
    Account: "खाते",
    Commission: "कमिशन",
    "No referrals have been recorded yet.": "अजून रेफरल नोंदवलेले नाहीत.",
    "Enter a valid mobile number.": "वैध मोबाइल नंबर द्या.",
    "That mobile number is already in use.": "हा मोबाइल नंबर आधीच वापरात आहे.",
    "Could not save your number.": "तुमचा नंबर जतन करता आला नाही.",
    "Mobile number saved.": "मोबाइल नंबर जतन केला.",
    "Client invite link copied.": "क्लायंट आमंत्रण लिंक कॉपी केली.",
    "Could not copy the referral code. Select and copy it instead.":
      "रेफरल कोड कॉपी झाला नाही. तो निवडून कॉपी करा.",
  },
};

const originalText = new WeakMap<Text, { source: string; translated: string }>();
const originalAttributes = new WeakMap<
  Element,
  Map<string, { source: string; translated: string }>
>();

function translateText(value: string, language: Language) {
  return language === "en" ? value : (translations[language][value] ?? value);
}

function applyDocumentLanguage(language: Language) {
  document.documentElement.lang = language;

  const translate = (root: Node) => {
    const updateText = (textNode: Text) => {
      const previous = originalText.get(textNode);
      const current = textNode.data;
      const source = previous && current === previous.translated ? previous.source : current;
      const translated = translateText(source, language);
      if (translated !== current) textNode.data = translated;
      originalText.set(textNode, { source, translated });
    };
    if (root instanceof Text) updateText(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) updateText(textNode);

    const elements =
      root instanceof Element
        ? [root, ...root.querySelectorAll("*")]
        : [...(root as ParentNode).childNodes].flatMap((child) =>
            child instanceof Element ? [child, ...child.querySelectorAll("*")] : [],
          );
    for (const element of elements) {
      const values = originalAttributes.get(element) ?? new Map();
      for (const attribute of ["aria-label", "placeholder", "title"]) {
        const value = element.getAttribute(attribute);
        if (value === null) continue;
        const previous = values.get(attribute);
        const source = previous && value === previous.translated ? previous.source : value;
        const translated = translateText(source, language);
        if (translated !== value) element.setAttribute(attribute, translated);
        values.set(attribute, { source, translated });
      }
      originalAttributes.set(element, values);
    }
  };

  translate(document.body);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData" && record.target instanceof Text) {
        const current = record.target.data;
        const previous = originalText.get(record.target);
        const source = previous && current === previous.translated ? previous.source : current;
        const translated = translateText(source, language);
        if (translated !== current) {
          originalText.set(record.target, { source, translated });
          record.target.data = translated;
        }
      } else {
        for (const node of record.addedNodes) {
          if (node instanceof Element || node instanceof Text) translate(node);
        }
        if (record.type === "attributes" && record.target instanceof Element) {
          translate(record.target);
        }
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "placeholder", "title"],
  });
  return () => observer.disconnect();
}

function notificationSeenStorageKey(userId: string) {
  return `rating-guard:notifications:seen:${userId}`;
}

function readSeenNotifications(userId: string) {
  try {
    const saved = localStorage.getItem(notificationSeenStorageKey(userId));
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set<string>();
  }
}

async function loadNotifications(
  userId: string,
  isSuperAdmin: boolean,
  isClient: boolean,
): Promise<NotificationSource> {
  const errors: string[] = [];
  const requests: PromiseLike<HeaderNotification[]>[] = [
    supabase
      .from("internal_messages")
      .select("id,sender_role,message,created_at")
      .eq("receiver_id", userId)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) {
          errors.push("Chat notifications are unavailable.");
          return [];
        }
        return data.map((message) => ({
          id: `message:${message.id}`,
          title: "New chat message",
          description: `${message.sender_role}: ${message.message.slice(0, 120)}`,
          createdAt: message.created_at,
          target: "/chat" as const,
        }));
      }),
  ];

  if (isSuperAdmin) {
    requests.push(
      supabase
        .from("staff")
        .select("id,name,status,created_at")
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data, error }) => {
          if (error) {
            errors.push("Staff registration notifications are unavailable.");
            return [];
          }
          return data.map((staff) => ({
            id: `staff:${staff.id}`,
            title: "New staff registration",
            description: `${staff.name} · ${staff.status}`,
            createdAt: staff.created_at,
            target: "/admin/staff" as const,
          }));
        }),
    );
  }

  if (isSuperAdmin || isClient) {
    let reportsQuery = supabase
      .from("reports")
      .select("id,report_number,status,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (isClient) reportsQuery = reportsQuery.eq("user_id", userId);
    requests.push(
      reportsQuery.then(({ data, error }) => {
        if (error) {
          errors.push("Report notifications are unavailable.");
          return [];
        }
        return data.map((report) => ({
          id: `report:${report.id}`,
          title: "New report submitted",
          description: `${report.report_number} · ${report.status}`,
          createdAt: report.created_at,
          target: isSuperAdmin ? "/reports" : "/client/reports",
        }));
      }),
    );
  }

  const settled = await Promise.all(requests);
  return {
    items: settled
      .flat()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 10),
    errors,
  };
}

export function GlobalHeaderControls({
  userId,
  isSuperAdmin,
  isClient,
}: {
  userId: string;
  isSuperAdmin: boolean;
  isClient: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery(profileQuery());
  const [language, setLanguage] = useState<Language>("en");
  const [seenIds, setSeenIds] = useState<Set<string>>(() => readSeenNotifications(userId));
  const notifications = useQuery({
    queryKey: ["global-notifications", userId, isSuperAdmin, isClient],
    queryFn: () => loadNotifications(userId, isSuperAdmin, isClient),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const saved = profile?.language;
    if (saved === "hi" || saved === "mr" || saved === "en") setLanguage(saved);
  }, [profile?.language]);

  useEffect(() => applyDocumentLanguage(language), [language]);

  useEffect(() => {
    if (!notifications.data) return;
    const key = notificationSeenStorageKey(userId);
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) {
        const baseline = notifications.data.items
          .filter((item) => !item.id.startsWith("message:"))
          .map((item) => item.id);
        localStorage.setItem(key, JSON.stringify(baseline));
        setSeenIds(new Set(baseline));
      } else {
        setSeenIds(readSeenNotifications(userId));
      }
    } catch {
      setSeenIds(new Set());
    }
  }, [notifications.data, userId]);

  const unseenCount = useMemo(
    () => (notifications.data?.items ?? []).filter((item) => !seenIds.has(item.id)).length,
    [notifications.data?.items, seenIds],
  );
  const translated = (value: string) => translateText(value, language);

  async function selectLanguage(next: string) {
    if (next !== "en" && next !== "hi" && next !== "mr") return;
    setLanguage(next);
    const { error } = await supabase
      .from("profiles")
      .update({ language: next, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) {
      setLanguage(
        profile?.language === "hi" || profile?.language === "mr" ? profile.language : "en",
      );
      toast.error("Could not save language preference. Please try again.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  function markSeenAndNavigate(item: HeaderNotification) {
    const next = new Set(seenIds);
    next.add(item.id);
    setSeenIds(next);
    try {
      localStorage.setItem(
        notificationSeenStorageKey(userId),
        JSON.stringify([...next].slice(-500)),
      );
    } catch {
      // Notification navigation should still work when storage is unavailable.
    }
    void navigate({ to: item.target });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              unseenCount
                ? `${translated("Notifications")}: ${unseenCount} new`
                : translated("Notifications")
            }
            title={translated("Notifications")}
            className="relative grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell className="size-5" aria-hidden />
            {unseenCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unseenCount > 99 ? "99+" : unseenCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))]">
          <DropdownMenuLabel>{translated("Notifications")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.isPending && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {translated("Loading notifications…")}
            </p>
          )}
          {notifications.error && (
            <p role="alert" className="px-2 py-4 text-sm text-destructive">
              {translated("Could not load notifications")}
            </p>
          )}
          {notifications.data?.items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onSelect={() => markSeenAndNavigate(item)}
              className="cursor-pointer items-start gap-3 whitespace-normal py-3"
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${seenIds.has(item.id) ? "bg-muted" : "bg-red-600"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{translated(item.title)}</span>
                <span className="mt-0.5 block break-words text-xs text-muted-foreground">
                  {item.description}
                </span>
                <time className="mt-1 block text-[10px] text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </span>
              {seenIds.has(item.id) && <Check className="mt-1 size-3 text-muted-foreground" />}
            </DropdownMenuItem>
          ))}
          {notifications.data?.items.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {translated("No new notifications")}
            </p>
          )}
          {(notifications.data?.errors.length ?? 0) > 0 && (
            <p role="status" className="px-2 py-2 text-xs text-amber-700">
              {notifications.data?.errors.join(" ")}
            </p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => void navigate({ to: isSuperAdmin ? "/admin/staff" : "/chat" })}
          >
            {translated("View all notifications")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={translated("Language / भाषा")}
            title={translated("Language / भाषा")}
            className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Globe2 className="size-5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuLabel>{translated("Language / भाषा")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={language}
            onValueChange={(value) => void selectLanguage(value)}
          >
            {languages.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id}>
                <span>{item.label}</span>
                {item.id !== "en" && (
                  <span className="ml-auto text-muted-foreground">{item.native}</span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Link
        to="/chat"
        aria-label={translated("Chats")}
        title={translated("Chats")}
        className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageCircle className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
