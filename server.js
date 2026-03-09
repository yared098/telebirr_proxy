import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8001;

app.get("/check", async (req, res) => {
    // 1. CLEAN TXID (Removes spaces, dots, and newlines)
    let { txid } = req.query;
    if (txid) txid = txid.trim().replace(/[.\s]/g, "");

    console.log(`[${new Date().toLocaleString()}] 🔍 REQUEST: ${txid}`);

    if (!txid) {
        return res.status(400).json({ success: false, message: "TXID required" });
    }

    try {
        const url = `https://transactioninfo.ethiotelecom.et/receipt/${txid}`;
        const response = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 15000
        });

        const html = response.data;
        const $ = cheerio.load(html);
        
        // Use a more aggressive text capture
        const pageText = $("body").text().replace(/\s+/g, ' '); 

        // --- FLEXIBLE EXTRACTION ---

        // DATE: Looks for DD-MM-YYYY or DD/MM/YYYY
        const dateMatch = pageText.match(/(\d{2}[-\/]\d{2}[-\/]\d{4})/);

        // NAME: Looks for "Credited Party", "Receiver", or "Customer Name"
        const receiverMatch = pageText.match(/(?:Credited Party name|Receiver Name|Customer Name|Receiver)[:\s]*([A-Za-z ]+)/i);

        // AMOUNT: Looks for "Total Paid", "Settled", or "Amount" followed by numbers
        const amountMatch = pageText.match(/(?:Total Paid Amount|Settled Amount|Amount|Paid)[:\s]*([\d,.]+)/i);

        if (!receiverMatch || !amountMatch || !dateMatch) {
            // DEBUG: Log the first 200 characters of page text to see what Telebirr is sending
            console.error(`[${new Date().toLocaleString()}] ❌ PARSE FAIL: Text structure changed.`);
            console.log("Snippet:", pageText.substring(0, 300)); 
            
            return res.json({
                success: false,
                message: "Unable to parse receipt. Structure might have changed."
            });
        }

        const result = {
            success: true,
            transaction_id: txid,
            receiver_name: receiverMatch[1].trim(),
            amount: parseFloat(amountMatch[1].replace(/,/g, "")),
            date: dateMatch[1].replace(/\//g, "-") // Normalize to DD-MM-YYYY
        };

        console.log(`[${new Date().toLocaleString()}] ✅ VERIFIED: ${txid}`);
        console.table(result);

        return res.json(result);

    } catch (error) {
        console.error(`[${new Date().toLocaleString()}] 🔥 PROXY ERROR: ${error.message}`);
        return res.status(500).json({ success: false, message: "Telebirr site unreachable" });
    }
});

app.listen(PORT, () => console.log(`🚀 Proxy active on port ${PORT}`));