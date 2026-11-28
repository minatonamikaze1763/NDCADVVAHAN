import test from "node:test";
import assert from "node:assert/strict";
import {validAadhaar,validPan,validChassis,validPin,validMobile,validEmail,validDate} from "../validators.js";
import {parseAadhaar} from "../parsers/aadhaar-parser.js";
import {parsePan} from "../parsers/pan-parser.js";
import {parseSaleCard} from "../parsers/salecard-parser.js";

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
  assert.equal(aadhaar.careOfName.value,"Example Person");
  const pan=parsePan("Name\nSample Person\nFather's Name\nExample Person\nABCDE1234F\n01/01/1990");
  assert.equal(pan.panNumber.value,"ABCDE1234F");
  const sale=parseSaleCard("Chassis No: 1HGCM82633A004352\nEngine No: EN123456\nMobile: 9052691719\nInvoice No: INV-123");
  assert.equal(sale.chassisNumber.value,"1HGCM82633A004352");
  assert.equal(sale.invoiceNumber.value,"INV-123");
});
