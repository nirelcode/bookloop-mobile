// Supabase Edge Function: notify-message
// Triggered by a DB Webhook: INSERT on public.messages
// Setup in Supabase dashboard: Database → Webhooks → Create webhook
//   Table: messages, Events: INSERT, URL: <your-function-url>

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record; // new messages row

    if (!record?.chat_id || !record?.sender_id || !record?.content) {
      return new Response('Missing fields', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find recipient (the other person in the chat)
    const { data: chat } = await supabase
      .from('chats')
      .select('buyer_id, seller_id')
      .eq('id', record.chat_id)
      .single();

    if (!chat) return new Response('Chat not found', { status: 200 });

    const recipientId =
      chat.buyer_id === record.sender_id ? chat.seller_id : chat.buyer_id;

    // Get recipient's push token
    const { data: recipient } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (!recipient?.push_token) {
      return new Response('No push token for recipient', { status: 200 });
    }

    // Get sender's display name
    const { data: sender } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', record.sender_id)
      .single();

    const senderName = sender?.name || 'Someone';

    // Truncate message body for preview
    const body =
      record.content.length > 100
        ? record.content.slice(0, 97) + '...'
        : record.content;

    // Send via Expo Push API
    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipient.push_token,
        title: senderName,
        body,
        sound: 'default',
        channelId: 'messages',
        data: {
          chatId: record.chat_id,
          senderId: record.sender_id,
          senderName,
        },
      }),
    });

    const pushData = await pushRes.json();
    console.log('Expo push response:', JSON.stringify(pushData));

    return new Response('OK', { status: 200 });
  } catch (e) {
    // Always return 200 so the webhook doesn't keep retrying
    console.error('notify-message error:', e);
    return new Response('Error', { status: 200 });
  }
});
