import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8001;
app.get("/check", async (req, res) => {
    let { txid } = req.query;
    if (txid) txid = txid.trim().replace(/[.\s]/g, "");

    const url = `https://transactioninfo.ethiotelecom.et/receipt/${txid}`;
    console.log(`[${new Date().toLocaleString()}] 🔍 REQUEST: ${txid}`);

    try {
        const response = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const pageText = $("body").text().replace(/\s+/g, ' '); 

        // --- IMPROVED EXTRACTION ---

        // 1. DATE: Find date specifically AFTER the Transaction ID or "Invoice details"
        // This avoids picking up the company's 2003 VAT date
        const dateMatch = pageText.match(/(?:Payment date|Invoice details).*?(\d{2}-\d{2}-\d{4})/i);

        // 2. NAME: Look specifically for "Credited Party name"
        const receiverMatch = pageText.match(/Credited Party name\s*([A-Z\s]+?)(?:የገንዘብ|Credited party account)/i);

        // 3. AMOUNT: Look for "Total Paid Amount" or "Settled Amount" specifically
        // We look for the number followed by "Birr" to be safe
        const amountMatch = pageText.match(/(?:Total Paid Amount|Settled Amount|ጠቅላላ የተከፈለ)\s*([\d,.]+)/i);
        
        if (!receiverMatch || !amountMatch || !dateMatch) {
            return res.json({
                success: false,
                message: "Could not locate transaction details. The ID might be invalid."
            });
        }

        const result = {
            success: true,
            transaction_id: txid,
            receiver_name: receiverMatch[1].trim(),
            amount: parseFloat(amountMatch[1].replace(/,/g, "")),
            date: dateMatch[1].replace(/\//g, "-"),
            server_url: url
        };

        console.table(result);
        return res.json(result);

    } catch (error) {
        return res.status(500).json({ success: false, message: "Telebirr unreachable" });
    }
});
app.listen(PORT, () => {
    console.log(`🚀 Proxy active on port ${PORT}`);
    console.log(`🔗 Local link: http://localhost:${PORT}/check?txid=TEST_ID`);
});