/**
 * FlyAjwa WhatsApp Utility
 * Interface for Meta Cloud API or Third-Party WhatsApp Gateways
 */
const axios = require('axios');

async function sendWhatsAppGreeting(phone, name, destination) {
  const { WHATSAPP_API_KEY, WHATSAPP_PHONE_ID } = process.env;

  if (!WHATSAPP_API_KEY || !WHATSAPP_PHONE_ID) {
    console.log(`[WhatsApp] Simulation: Auto-greeting sent to ${name} (${phone}) regarding ${destination}`);
    return { success: true, status: 'Simulated' };
  }

  try {
    // Official Meta Cloud API Implementation Template
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "lead_greeting_v1", // Must be pre-approved in Meta Manager
          language: { code: "en_GB" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: name },
                { type: "text", text: destination || "your dream vacation" }
              ]
            }
          ]
        }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_API_KEY}` } }
    );

    return { success: true, messageId: response.data.messages[0].id };
  } catch (error) {
    console.error('[WhatsApp] Send failed:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendWhatsAppGreeting };
