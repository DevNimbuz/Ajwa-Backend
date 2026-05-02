/**
 * Flyajwa WhatsApp Utility
 * Interface for Meta Cloud API or Third-Party WhatsApp Gateways
 */
const axios = require('axios');

async function sendWhatsAppGreeting(phone, name, destination) {
  const { WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;

  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[WhatsApp] Simulation: Auto-greeting sent to ${name} (${phone}) regarding ${destination}`);
    return { success: true, status: 'Simulated' };
  }

  // Sanitize phone number (remove +, spaces, etc)
  const cleanPhone = phone.replace(/\D/g, '');

  try {
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: "new_lead_greeting",
          language: { code: "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: name },
                { type: "text", text: destination || "Flyajwa Holidays" }
              ]
            }
          ]
        }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_API_TOKEN}` } }
    );

    return { success: true, messageId: response.data.messages[0].id };
  } catch (error) {
    console.error('[WhatsApp] Send failed:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendWhatsAppGreeting };
