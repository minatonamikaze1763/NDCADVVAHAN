// Shared filename rules for preparation and upload fallback.
(() => {
  "use strict";
  const rules = [
  {
    "id": "address-proof",
    "category": "Address Proof",
    "aliases": [
      "addressproof",
      "proofofaddress",
      "aadhar",
      "aadhaar",
      "aadharcard",
      "aadhaarcard",
      "addressdocument",
      "bankpassbook",
      "passbook",
      "electricitybill",
      "currentbill",
      "gasbill",
      "waterbill",
      "telephonebill",
      "rationcard",
      "voterid",
      "passport",
      "addressproofdocument",
      "addressproofdoc",
      "residentialproof",
      "residenceproof",
      "residenceaddress",
      "addressverification",
      "addressid",
      "adhar",
      "adhaar",
      "adharcard",
      "adhaarcard",
      "uidai",
      "bankpassbookphoto",
      "electricbill",
      "powerbill",
      "ebbill",
      "tsspdcl",
      "tsnpdcl",
      "gascylinderbill",
      "pipedgasbill",
      "pngbill",
      "lpgbill",
      "gstcertificate",
      "gstregistration",
      "gstin",
      "companyregisteredcertificate",
      "companyregistrationcertificate",
      "businessregistrationcertificate",
      "udyamregistration",
      "waterutilitybill",
      "delhijalboard",
      "jalboard",
      "passportaddressproof",
      "foodsecuritycard",
      "landlinebill",
      "phonebill",
      "fixedlinebill",
      "bsnlbill",
      "voteridcard",
      "votercard",
      "electioncard",
      "epiccard",
      "electorphotoidentitycard",
      "addressprf",
      "addrproof",
      "addresscopy",
      "aadhaarcopy",
      "aadharcopy",
      "electricity",
      "gasconnection",
      "waterconnection",
      "aadharfront",
      "aadharback",
      "aadhaarfront",
      "aadhaarback",
      "address",
      "addressproofcopy",
      "proofaddress",
      "uidcard",
      "eaadhaar",
      "eaadhar",
      "adahar",
      "adharfront",
      "adharback"
    ]
  },
  {
    "id": "insurance",
    "category": "Certificate of Insurance submitted at the time of first registration",
    "aliases": [
      "insurancecertificate",
      "certificateofinsurance",
      "insurancepolicy",
      "policycopy",
      "insurance",
      "insurancecopy",
      "insurancepaper",
      "insurancepapers",
      "insuranceproof",
      "policycertificate",
      "policydocument",
      "policy",
      "motorinsurance",
      "vehicleinsurance",
      "bikeinsurance",
      "twowheelerinsurance",
      "insurancepdf",
      "insurancefront",
      "insuranceback",
      "insurancevalidity",
      "insurancecovernote",
      "covernote",
      "insurancepremium",
      "insurancedocument",
      "ins",
      "inscopy",
      "inscert",
      "inscertificate",
      "inspolicy",
      "motorpolicy",
      "insurancecover",
      "insurancecert",
      "insurancecertificatecopy",
      "insurence"
    ]
  },
  {
    "id": "dealer-invoice",
    "category": "Dealers Invoice",
    "aliases": [
      "dealerinvoice",
      "dealersinvoice",
      "taxinvoice",
      "salesinvoice",
      "invoice",
      "dealerinv",
      "vehicleinvoice",
      "purchaseinvoice",
      "purchasebill",
      "vehiclebill",
      "saleinvoice",
      "invoicecopy",
      "invoicepdf",
      "invoicedocument",
      "showroombill",
      "showroominvoice",
      "heroinvoice",
      "retailinvoice",
      "retailsaleinvoice",
      "customerinvoice",
      "finalinvoice",
      "inv",
      "invc",
      "invcopy",
      "taxinv",
      "salesinv",
      "vehicleinv",
      "billofsale",
      "dealerbill",
      "invoiceoriginal",
      "invoicecustomer"
    ]
  },
  {
    "id": "form20",
    "category": "Form 20 If Finance Form 20 Two copies with Financier Seal and Signature",
    "aliases": [
      "form20",
      "financeform20",
      "form20finance",
      "form20financier",
      "financierform20",
      "financerform20",
      "financedform20",
      "form20bank",
      "bankform20",
      "loanform20",
      "hypothecationform20",
      "form20withfinancier",
      "form20withbank",
      "form20withseal",
      "form20seal",
      "form20signature",
      "form20signedbyfinancier",
      "formtwentyfinance",
      "formtwenty",
      "20",
      "f20",
      "frm20",
      "finance20",
      "fin20",
      "20finance",
      "20financier",
      "formxx",
      "applicationforregistration",
      "form20financiersignature",
      "form20withfinancierseal",
      "form20withbanksignature"
    ]
  },
  {
    "id": "inspection",
    "category": "FORM 20 Print From VAHAN4 With Signature By Vehicle Purchaser And Chassis Print",
    "aliases": [
      "inspection",
      "form20withsign",
      "form20withsignature",
      "inspectioncertificate",
      "form20inspection",
      "inspectionform20",
      "vehicleinspection",
      "chassisprintform20",
      "form20chassisprint",
      "form20purchasersignature",
      "purchasersignatureform20",
      "buyersignatureform20",
      "form20buyer",
      "form20owner",
      "form20withoutfinance",
      "unsignedfinanceform20",
      "insp",
      "inspcopy",
      "inspcert",
      "inspcertificate",
      "inspreport",
      "inspectioncopy",
      "inspectionreport",
      "form20signed",
      "signedform20",
      "form20withchassis",
      "form20chassis",
      "form20signedchassis",
      "form20purchasersign",
      "form20ownersign",
      "form20customersign",
      "form20buyersign",
      "inspectionform"
    ]
  },
  {
    "id": "form22",
    "category": "Form 22 (Road Worthiness Certificate)",
    "aliases": [
      "form22",
      "formtwentytwo",
      "roadworthinesscertificate",
      "roadworthiness",
      "fitnesscertificate",
      "certificateofroadworthiness",
      "fitnesscert",
      "manufacturerroadworthiness",
      "manufacturercertificate",
      "cmvrform22",
      "form22certificate",
      "form22pdf",
      "form22signed",
      "vehiclefitnesscertificate",
      "22",
      "f22",
      "frm22",
      "roadworthy",
      "roadworthycertificate",
      "formxxii",
      "roadworthinesscert"
    ]
  },
  {
    "id": "form21",
    "category": "Form 21 (Sale Certificate)",
    "aliases": [
      "form21",
      "formtwentyone",
      "salecertificate",
      "salescertificate",
      "certificateofsale",
      "vehiclesalecertificate",
      "dealersalecertificate",
      "manufacturersalecertificate",
      "form21certificate",
      "form21pdf",
      "form21signed",
      "deliverycertificate",
      "vehiclepurchasecertificate",
      "21",
      "f21",
      "frm21",
      "salecert",
      "salescert",
      "formxxi"
    ]
  },
  {
    "id": "owner-signature",
    "category": "Owners Signature",
    "aliases": [
      "ownerssignature",
      "ownerssign",
      "ownersignature",
      "signature",
      "sign",
      "ownersign",
      "customersignature",
      "applicantsignature",
      "buyersignature",
      "purchasersignature",
      "signimage",
      "signatureimage",
      "signaturephoto",
      "signstamp",
      "signedbyowner",
      "sn",
      "ownersn",
      "customersn",
      "applicantsn",
      "customersign",
      "applicantsign",
      "signaturecopy",
      "signaturecustomer",
      "signatureowner",
      "signcustomer",
      "signowner",
      "sig"
    ]
  },
  {
    "id": "owner-photo",
    "category": "Owners Photo",
    "aliases": [
      "ownerphoto",
      "ownersphoto",
      "customerphoto",
      "applicantphoto",
      "photograph",
      "photo",
      "pic",
      "ownerpic",
      "ownerspic",
      "customerpic",
      "applicantpic",
      "passportphoto",
      "passportsizephoto",
      "profilephoto",
      "profilepic",
      "personphoto",
      "personimage",
      "customerimage",
      "ownerimage",
      "applicantimage",
      "selfie",
      "facephoto",
      "faceimage",
      "recentphoto",
      "colourphoto",
      "colorphoto",
      "ownerphotograph",
      "customerphotograph",
      "applicantphotograph",
      "photocustomer",
      "photoowner",
      "photoapplicant",
      "picture",
      "portrait",
      "passportsizephotograph",
      "passportphotograph",
      "ppphoto",
      "ppsizephoto",
      "customerportrait"
    ]
  },
  {
    "id": "frontphoto",
    "category": "Owners Photo with Vehicle",
    "aliases": [
      "frontphoto",
      "vehiclefrontphoto",
      "ownersphotowithvehicle",
      "photowithvehicle",
      "vehiclephoto",
      "frontview",
      "ownerphotowithvehicle",
      "vehiclewithowner",
      "ownerandvehicle",
      "frontvehiclephoto",
      "vehiclefront",
      "bikefrontphoto",
      "bikefront",
      "motorcyclefront",
      "scooterfront",
      "customerwithvehicle",
      "customervehiclephoto",
      "deliveryphoto",
      "deliveryphotowithvehicle",
      "vehiclehandoverphoto",
      "riderwithvehicle",
      "cwvp",
      "cwvpimage",
      "cwvpcopy",
      "customerwithvehiclephoto",
      "customerphotowithvehicle",
      "ownerwithvehicle",
      "ownerwithvehiclephoto",
      "customerandvehicle",
      "ownerwithbike",
      "customerwithbike",
      "customerwithscooter",
      "ownerwithscooter",
      "ownerwithcar",
      "customerwithcar",
      "photowithbike",
      "photowithcar",
      "photowithscooter",
      "vehicleownerphoto",
      "photoofvehicle",
      "vehiclephotograph",
      "frontpic",
      "vehiclepic",
      "bikephoto",
      "scooterphoto"
    ]
  },
  {
    "id": "pan-card",
    "category": "PAN Card",
    "aliases": [
      "pancard",
      "permanentaccountnumber",
      "pan",
      "pancopy",
      "pandocument",
      "panproof",
      "panimage",
      "panphoto",
      "panfront",
      "panfrontside",
      "panverification",
      "panidentity",
      "incometaxpan",
      "nsdlpan",
      "utipan",
      "pancardcopy",
      "ownerpan",
      "customerpan",
      "applicantpan",
      "epan",
      "panback",
      "panscan",
      "pancertificate",
      "pancustomer",
      "panowner"
    ]
  },
  {
    "id": "chassis-photo",
    "category": "Photo of chassis",
    "aliases": [
      "photoofchassis",
      "chassisphoto",
      "chassisnumberphoto",
      "chassis",
      "chassisno",
      "chassisnumber",
      "chassisnophoto",
      "chassisprint",
      "chassisimprint",
      "chassisengraving",
      "chassisetching",
      "chassisdetail",
      "chassisdetails",
      "chassisimage",
      "chassisnumberimage",
      "framenumber",
      "vinphoto",
      "vinnumber",
      "vin",
      "chas",
      "chasis",
      "chassisimpression",
      "chassisrubbing",
      "framephoto"
    ]
  }
];

  // Additional incomplete-name series. Minimum lengths keep short prefixes
  // deliberate: PA means PAN, while INS and INSP retain their existing rules.
  // Match complete filename tokens, never a prefix inside a longer person/name word.
  const partialNameSeries = [
    {id: 'address-proof', stems: ['aadhaar', 'aadhar', 'adhaar', 'adhar'], min: 4},
    {id: 'address-proof', stems: ['addressproof'], min: 5},
    {id: 'insurance', stems: ['insurance', 'insurence'], min: 4},
    {id: 'dealer-invoice', stems: ['invoice'], min: 4},
    {id: 'inspection', stems: ['inspection'], min: 5},
    {id: 'owner-signature', stems: ['signature'], min: 4},
    {id: 'owner-photo', stems: ['photo', 'photograph'], min: 4},
    {id: 'frontphoto', stems: ['frontphoto'], min: 5},
    {id: 'pan-card', stems: ['pan'], min: 2},
    {id: 'chassis-photo', stems: ['chassis', 'chasis'], min: 4}
  ];
  function matchPartialName(base) {
    const ids = new Set();
    // Digits and separators allow numbered copies such as insu1 and phot (2).
    const tokens = base.match(/[a-z]+/g) || [];
    for (const token of tokens) for (const series of partialNameSeries) {
      if (token.length >= series.min && series.stems.some(stem => stem.startsWith(token))) ids.add(series.id);
    }
    if (ids.size !== 1) return null;
    const rule = rules.find(rule => ids.has(rule.id));
    return {id: rule.id, category: rule.category};
  }

  const baseName = name => String(name || '').normalize('NFKC').replace(/\.(?:pdf|jpe?g|png|webp)$/i, '').toLowerCase();
  const compact = name => name.replace(/[^a-z0-9]/g, '');
  function match(fileName) {
    const base = baseName(fileName), name = compact(base);
    const positions = [];
    for (let index = 0; index < base.length; index++) if (/[a-z0-9]/.test(base[index])) positions.push(index);
    if (!name) return null;
    const hits = [];
    for (const rule of rules) for (const alias of rule.aliases) {
      if (/^\d+$/.test(alias)) {
        // Bare form numbers are valid only with copy/scan markers, never dates.
        const number = base.match(/^(?:(?:copy|scan|scanned|document|doc)[\s_-]+)*(20|21|22)(?:[\s_-]+(?:copy|scan|scanned|document|doc))*(?:[\s_-]*\(\d+\))?$/);
        if (number?.[1] === alias) hits.push({id:rule.id,start:0,end:name.length});
        continue;
      }
      // Short aliases need word boundaries; digits may mark copies (PAN1, INS2).
      if (alias.length <= 4 && !/^(?:f|frm)(?:20|21|22)$/.test(alias)) {
        const pattern = new RegExp('(^|[^a-z])' + alias + '(?=[^a-z]|$)', 'g');
        for (const found of base.matchAll(pattern)) {
          const start = compact(base.slice(0, found.index + found[1].length)).length;
          hits.push({id:rule.id,start,end:start+alias.length});
        }
        continue;
      }
      let start = name.indexOf(alias);
      while (start !== -1) {
        // Form numbers must not eat a different number, e.g. form210 or form2026.
        const numericTail = /(?:20|21|22)$/.test(alias) && /[0-9]/.test(base[positions[start+alias.length-1]+1] || '');
        if (!numericTail) hits.push({id:rule.id,start,end:start+alias.length});
        start = name.indexOf(alias,start+1);
      }
    }
    // A specific compound consumes its generic parts: passport photo, PAN photo,
    // chassis photo, owner-with-vehicle photo, signed Form 20, and Form 21/22 words.
    const specific = hits.filter(hit => !hits.some(other => other.id !== hit.id && other.start <= hit.start && other.end >= hit.end && other.end-other.start > hit.end-hit.start));
    const ids = new Set(specific.map(hit=>hit.id));
    // Preserve every existing match and every existing category conflict.
    // Only use the additional series when the original rules found no hits.
    if (!hits.length) return matchPartialName(base);
    if (ids.size !== 1) return null;
    const rule = rules.find(rule=>rule.id === [...ids][0]);
    return {id:rule.id,category:rule.category};
  }
  globalThis.NDCDocumentMatcher = Object.freeze({match, categories: Object.freeze(rules.map(rule => rule.category))});
})();
