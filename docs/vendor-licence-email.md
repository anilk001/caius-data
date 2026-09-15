# Pre-purchase licence email — BillOfLadingData.com

Sent before paying the $499 setup fee. The answers to Q1 and Q11 decide whether
any purchase happens at all; the rest shape what a pack may contain and what our
own terms have to say.

---

**Subject:** Licence terms for resale of derived records — question before purchase

Hello,

Before we pay the $499 setup fee I need to confirm that the licence covers our
use case. I would rather raise this now than after purchasing.

**What we do**

We operate caiusdata.com. We sell one-off data packs to exporters: typically
200–500 company records for a single HS code and origin country, delivered once
as a CSV by email, priced between $19 and $49. There is no subscription and no
login. Most of our customers are exporters in India, and they keep the CSV
permanently.

We would build these packs from your company record endpoints, cleaned,
de-duplicated and filtered on our side, and stored in our own database.

Please confirm in writing:

1. **Resale.** Does the licence permit us to sell records obtained from your API
   to our own customers, as described above? If so, under which plan, and at
   what additional cost if any?

2. **Scope.** Is there any cap on the number of end customers, the number of
   records per customer, or the total number of records we may redistribute?

3. **Form.** Does it matter whether we redistribute your fields as returned, or
   only our own derived output (cleaned company names, merged duplicates, our
   own HS classification and filtering)? Is either treated differently?

4. **Storage.** May we store records permanently in our own database and reuse
   them across multiple packs and multiple customers, or is use time-limited?

5. **Survival.** If we stop buying credits, or the agreement ends, may our
   customers keep and continue using the CSVs already delivered to them? What
   are we required to do with our stored copy?

6. **Onward transfer.** Our customers receive a file. What restrictions must we
   impose on them? We will put your required wording into our terms of sale.

7. **Attribution.** Must we credit BillOfLadingData.com as the source — in the
   file, on the website, or in our terms? Please give the exact wording.

8. **Territory.** Any restriction on the countries we may sell to, or on
   competing with your own lead-building product?

9. **Your upstream rights.** Do you warrant that you hold the rights to license
   this data for onward resale, and do you indemnify us against a claim by an
   underlying data source? We take payment from the people who use the data, so
   this matters to us.

10. **Personal data.** Do any fields contain personal data of identifiable
    individuals — named contacts, personal email addresses, direct phone
    numbers? We are EU-based and need to know before handling it.

11. **Setup fee.** If the answer to question 1 is no, or the terms do not permit
    our model, is the $499 setup fee refundable?

Finally, please send the **written licence agreement** you would expect us to
sign. The Standard Terms published on your site cover rate limits and API key
security but say nothing about redistribution, so I would like the document that
does.

Two smaller technical points while you are replying:

* Does the All Importers endpoint accept `hs_codes` together with buyer country
  and seller country in a single request? Your dashboard offers all three
  together, and I want to confirm the API does the same.
* Could you send the parameters page for the shipment records endpoint, in the
  same format as your Search Filters documentation?

Many thanks,

Anil
Caius Data — caiusdata.com

---

## Notes to self

* If they answer only some questions, **1, 5, 9 and 11** are the ones that cannot
  be left open. 1 is permission, 5 is what happens to customers who already paid
  us, 9 is who carries the risk, 11 is whether asking costs anything.
* Get the answer from someone with authority to bind them, and in email rather
  than live chat. An agreement document beats an assurance.
* A "yes" that arrives without a written licence is worth very little. Ask again.
* Question 10 is not paperwork. We are EU-based, the buyers are outside the EU,
  and if the fields carry personal data then GDPR applies to the packs we sell,
  not just to the data we hold.
