import test from "node:test";
import assert from "node:assert/strict";
import {validAadhaar,validPan,validChassis,validPin,validMobile,validEmail,validDate} from "../validators.js";
import {parseAadhaar} from "../parsers/aadhaar-parser.js";
import {parsePan} from "../parsers/pan-parser.js";
import {parseSaleCard} from "../parsers/salecard-parser.js";
import {parseAddress} from "../parsers/address-parser.js";

test("validates standard field formats without guessing",()=>{
  assert.equal(validPan("ABCDE1234F"),true);
  assert.equal(validPan("ABCDE1234"),false);
  assert.equal(validChassis("1HGCM82633A004352"),true);
  assert.equal(validChassis("SHORT"),false);
  assert.equal(validPin("503001"),true);
  assert.equal(validMobile("9052691719"),true);
  assert.equal(validEmail("a@example.in"),true);
  assert.equal(validDate("2024-02-29"),true);
  assert.equal(validDate("2023-02-29"),false);
  assert.equal(validAadhaar("123456789012"),false);
});

test("parses labeled values and does not invent a full birth date",()=>{
  const aadhaar=parseAadhaar("Name: Sample Person\nYear of Birth: 1990\nC/O: Example Person\nPIN: 503001");
  assert.equal(aadhaar.birthYear.value,"1990");
  assert.equal(aadhaar.dateOfBirth,undefined);
  assert.equal(aadhaar.careOfName,undefined);
  const labeledGuardian=parseAadhaar("Guardian Name: Example Person");
  assert.equal(labeledGuardian.careOfName.value,"Example Person");
  const pan=parsePan("Name\nSample Person\nFather's Name\nExample Person\nABCDE1234F\n01/01/1990");
  assert.equal(pan.panNumber.value,"ABCDE1234F");
  const sale=parseSaleCard("Chassis No: 1HGCM82633A004352\nEngine No: EN123456\nMobile: 9052691719\nInvoice No: INV-123");
  assert.equal(sale.chassisNumber.value,"1HGCM82633A004352");
  assert.equal(sale.invoiceNumber.value,"INV-123");
  const prices=parseSaleCard("Ex-showroom price: 100000\nInvoice amount: 120000\nOn-road price: 135000");
  assert.equal(prices.exShowroomPrice.value,"100000");
  assert.equal(prices.invoiceAmount.value,"120000");
  assert.equal(prices.onRoadPrice.value,"135000");
  const address=parseAddress("Address:\nDoor No: 3-10-449\nVillage: Nizamabad\nMandal: Nizamabad\nDistrict: Nizamabad\nTelangana 503001");
  assert.equal(address.houseNumber.value,"3-10-449");
  assert.equal(address.talukaName.value,"Nizamabad");
  assert.equal(address.pincode.value,"503001");
});

test("Aadhaar number requires Aadhaar context and never uses mobile, VID or PIN digits",()=>{
  let valid="";
  for(let digit=0;digit<10;digit++){const candidate="12345678901"+digit;if(validAadhaar(candidate)){valid=candidate;break;}}
  assert.ok(valid,"synthetic checksum-valid Aadhaar fixture");
  const parsed=parseAadhaar("UIDAI Aadhaar\nAadhaar Number: "+valid+"\nMobile: 9052691719\nVID: 1234567890123456\nAddress:\nDoor No: 3-10-449\nVillage: Nizamabad\nMandal: Nizamabad\nDistrict: Nizamabad\nTelangana 503001");
  assert.equal(parsed.aadhaarNumber.value,valid);
  assert.equal(parsed.pincode.value,"503001");
  assert.equal(parseAadhaar("Mobile: 9052691719\nVID: 1234567890123456\nPIN: 503001").aadhaarNumber,undefined);
  assert.equal(parseAadhaar("Aadhaar No: XXXX XXXX 1234").aadhaarNumber,undefined);
  assert.equal(parseAadhaar("Aadhaar No: XXXX XXXX 1234").aadhaarLast4.value,"1234");
});

test("PAN parser keeps customer and father's names distinct when father label comes first",()=>{
  const pan=parsePan("Father's Name\nGUARDIAN SAMPLE\nName\nCUSTOMER SAMPLE\nPAN: ABCDE1234F\nDate of Birth: 01/02/1990");
  assert.equal(pan.customerName.value,"CUSTOMER SAMPLE");
  assert.equal(pan.careOfName.value,"GUARDIAN SAMPLE");
  assert.equal(pan.dateOfBirth.value,"1990-02-01");
});
