'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, AlertCircle, Plus, ChevronLeft, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Markdown from 'markdown-to-jsx';
import Link from 'next/link';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  message: string;
  created_at: Date;
}

interface TicketMessage {
  role: 'customer' | 'staff';
  message: string;
  image_url?: string;
  created_at: string;
}

interface SupportTicket {
  id: string;
  customer_id: string;
  order_id: string | null;
  category: string;
  risk_level: string;
  created_by: string;
  status: 'open' | 'in_progress' | 'resolved';
  note: string;
  created_at: string;
}

// Helper lấy key lưu trữ theo trạng thái đăng nhập và vai trò admin
const getStorageKeys = (isAdmin: boolean, uid: string) => {
  const userSuffix = uid ? `_${uid}` : '_guest';
  return {
    sessionKey: isAdmin ? `admin_chat_session_id${userSuffix}` : `chat_session_id${userSuffix}`,
    historyKey: isAdmin ? `admin_chat_history${userSuffix}` : `chat_history${userSuffix}`
  };
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [pathname, setPathname] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      setPathname(path);
      if (path.startsWith('/admin')) {
        setChatMode('bot');
      }
    }
  }, [isOpen]);

  const isAdminPage = pathname.startsWith('/admin');
  
  // AI Chatbot States
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [userToken, setUserToken] = useState<string | null>(null);

  // Phân hệ chat: AI Chatbot ('bot') hoặc Gửi hỗ trợ cho Nhân viên ('staff')
  const [chatMode, setChatMode] = useState<'bot' | 'staff'>('bot');
  
  // States cho Staff Support (Gặp nhân viên)
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  
  // Luồng Ticket: 'list' (danh sách) | 'create' (tạo mới) | 'chat' (phòng chat riêng của ticket)
  const [ticketFlow, setTicketFlow] = useState<'list' | 'create' | 'chat'>('list');
  const [ticketsList, setTicketsList] = useState<SupportTicket[]>([]);
  const [isTicketsLoading, setIsTicketsLoading] = useState(false);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [ticketChatInput, setTicketChatInput] = useState('');
  const [isSendingTicketMsg, setIsSendingTicketMsg] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Vui lòng chỉ chọn tệp hình ảnh!');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Nén ảnh: max width 500px, quality 0.7
          const canvas = document.createElement('canvas');
          const maxW = 500;
          const scale = Math.min(1, maxW / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL('image/jpeg', 0.7);
          setPendingImage(base64);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Form Tạo Ticket Mới
  const [ticketCategory, setTicketCategory] = useState('advisory');
  const [ticketOrderId, setTicketOrderId] = useState('');
  const [ticketNote, setTicketNote] = useState('');
  const [ticketSaving, setTicketSaving] = useState(false);
  const [ticketMsg, setTicketMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ticketChatEndRef = useRef<HTMLDivElement>(null);

  // Cuộn xuống tin nhắn mới nhất (AI Chat)
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Cuộn xuống tin nhắn mới nhất (Ticket Chat)
  const scrollTicketChatToBottom = () => {
    setTimeout(() => {
      ticketChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    if (isOpen && chatMode === 'bot') {
      scrollToBottom();
    }
  }, [messages, isOpen, chatMode]);

  useEffect(() => {
    if (isOpen && chatMode === 'staff' && ticketFlow === 'chat') {
      scrollTicketChatToBottom();
    }
  }, [activeTicket, isOpen, chatMode, ticketFlow]);



  // Khởi tạo session_id và lấy token khi widget mount hoặc user / pathname thay đổi
  useEffect(() => {
    if (!pathname) return;

    const isCurrentAdmin = pathname.startsWith('/admin');
    const { sessionKey, historyKey } = getStorageKeys(isCurrentAdmin, userId);
    
    let storedSession = localStorage.getItem(sessionKey);
    if (!storedSession) {
      storedSession = (isCurrentAdmin ? 'admin_sess_' : 'sess_') + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(sessionKey, storedSession);
    }
    setSessionId(storedSession);

    const storedHistory = localStorage.getItem(historyKey);
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory);
        setMessages(
          parsed.map((m: any) => ({
            ...m,
            created_at: new Date(m.created_at),
          }))
        );
      } catch (e) {
        console.error('Không thể phục hồi lịch sử chat:', e);
      }
    } else {
      setMessages([
        {
          id: 'welcome',
          role: 'agent',
          message: isCurrentAdmin
            ? 'Xin chào Admin! Tôi là Trợ lý AI Nội bộ (Admin Assistant) hỗ trợ quản trị hệ thống. Tôi có thể giúp gì cho bạn hôm nay? (Ví dụ: tra cứu doanh thu, chính sách hoàn tiền, hoặc quy trình xử lý ticket)'
            : 'Xin chào! Mình có thể giúp gì cho bạn về sản phẩm, đơn hàng hoặc chính sách đổi trả/bảo hành?',
          created_at: new Date(),
        },
      ]);
    }
  }, [pathname, userId]);
  useEffect(() => {
    const getSessionToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserToken(session?.access_token || null);
    };

    getSessionToken();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserToken(session?.access_token || null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Tải thông tin người dùng, đơn hàng và danh sách ticket khi đăng nhập
  const fetchUserAndOrdersAndTickets = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user) {
      setUserId(user.id);
      setUserEmail(user.email || '');
      
      // Tải đơn hàng thực tế
      const { data: ordersData } = await supabase
        .from('orders')
        .select('id, total')
        .order('created_at', { ascending: false });
      if (ordersData) {
        setUserOrders(ordersData);
      }

      // Tải danh sách ticket của user
      fetchUserTickets(user.id);
    }
  };

  const fetchUserTickets = async (custId: string) => {
    setIsTicketsLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('customer_id', custId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setTicketsList(data);
        // Cập nhật ticket đang active nếu có
        if (activeTicket) {
          const updatedActive = data.find(t => t.id === activeTicket.id);
          if (updatedActive) setActiveTicket(updatedActive);
        }
      }
    } catch (err) {
      console.error('Lỗi tải danh sách tickets:', err);
    } finally {
      setIsTicketsLoading(false);
    }
  };

  useEffect(() => {
    if (userToken) {
      fetchUserAndOrdersAndTickets();
    } else {
      setUserId('');
      setUserEmail('');
      setUserOrders([]);
      setTicketsList([]);
    }
  }, [userToken]);

  // Polling Live Chat - tự động cập nhật tin nhắn mới từ nhân viên mỗi 3 giây khi đang mở phòng chat ticket
  useEffect(() => {
    if (chatMode !== 'staff' || ticketFlow !== 'chat' || !activeTicket) return;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('id', activeTicket.id)
          .single();
        if (!error && data) {
          // Chỉ cập nhật nếu tin nhắn thay đổi hoặc đổi trạng thái
          if (data.note !== activeTicket.note || data.status !== activeTicket.status) {
            setActiveTicket(data);
            setTicketsList(prev => prev.map(t => t.id === data.id ? data : t));
          }
        }
      } catch (e) {
        console.error('Lỗi Polling ticket chat phía khách:', e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [chatMode, ticketFlow, activeTicket?.id, activeTicket?.note, activeTicket?.status]);

  // Lưu lịch sử chat AI
  useEffect(() => {
    if (!pathname) return;
    const isCurrentAdmin = pathname.startsWith('/admin');
    const { historyKey } = getStorageKeys(isCurrentAdmin, userId);
    if (messages.length > 0 && messages[0].id !== 'welcome') {
      localStorage.setItem(historyKey, JSON.stringify(messages));
    }
  }, [messages, pathname, userId]);

  // Gửi tin nhắn chat với AI
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsgText = input.trim();
    setInput('');

    const userMessage: ChatMessage = {
      id: 'usr_' + Date.now(),
      role: 'user',
      message: userMsgText,
      created_at: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const serviceUrl = isAdminPage ? '/api/chat/admin' : (process.env.NEXT_PUBLIC_RAG_SERVICE_URL || '/api/chat');
      
      const response = await fetch(serviceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { 'Authorization': `Bearer ${userToken}` } : {}),
        },
        body: JSON.stringify({
          message: userMsgText,
          session_id: sessionId,
          user_token: userToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Kết nối API bị lỗi');
      }

      const data = await response.json();

      const botMessage: ChatMessage = {
        id: 'bot_' + Date.now(),
        role: 'agent',
        message: data.reply || 'Xin lỗi, tôi gặp sự cố khi xử lý câu hỏi này.',
        created_at: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Lỗi gọi RAG API:', error);
      const errorMessage: ChatMessage = {
        id: 'err_' + Date.now(),
        role: 'agent',
        message: 'Có lỗi xảy ra khi kết nối với Trợ lý AI. Vui lòng kiểm tra cấu hình mạng hoặc thử lại sau!',
        created_at: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Tạo ticket gửi trực tiếp cho nhân viên (Giai đoạn Tạo mới)
  const handleCreateStaffTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketNote.trim()) {
      setTicketMsg({ type: 'error', text: 'Vui lòng nhập nội dung chi tiết yêu cầu hỗ trợ!' });
      return;
    }
    if (!userId) {
      setTicketMsg({ type: 'error', text: 'Vui lòng đăng nhập tài khoản của bạn để gửi yêu cầu hỗ trợ!' });
      return;
    }

    setTicketSaving(true);
    setTicketMsg(null);

    try {
      // Chuẩn hóa cuộc hội thoại ban đầu lưu trữ dưới dạng mảng JSON stringified trong cột `note`
      const initialMessage: TicketMessage = {
        role: 'customer',
        message: ticketNote.trim(),
        created_at: new Date().toISOString()
      };
      const noteJson = JSON.stringify([initialMessage]);

      const { data, error } = await supabase.from('support_tickets').insert({
        customer_id: userId,
        order_id: ticketOrderId ? ticketOrderId : null,
        category: ticketCategory,
        risk_level: 'low',
        created_by: 'customer',
        status: 'open',
        note: noteJson // Lưu mảng JSON tin nhắn vào cột note để tránh lỗi user_email và phục vụ chat 2 chiều
      }).select();

      if (error) throw error;

      setTicketMsg({
        type: 'success',
        text: 'Gửi yêu cầu hỗ trợ thành công! Nhân viên đang tiếp nhận xử lý.'
      });
      setTicketNote('');
      setTicketOrderId('');

      // Đồng thời thêm một tin nhắn hệ thống vào khung chat AI để lưu vết
      const ticketIdShort = data?.[0]?.id ? `#${data[0].id.substring(0, 8)}` : '';
      const notificationMsg: ChatMessage = {
        id: 'ticket_notify_' + Date.now(),
        role: 'agent',
        message: `📢 **Hệ thống**: Bạn đã gửi thành công yêu cầu hỗ trợ trực tiếp đến nhân viên (Mã Ticket: **${ticketIdShort}**). Bạn có thể theo dõi tiến độ và chat trực tiếp với nhân viên trong phân hệ "Gặp nhân viên" trên cửa sổ chat này.`,
        created_at: new Date()
      };
      setMessages((prev) => [...prev, notificationMsg]);

      // Tải lại danh sách ticket và quay lại giao diện list sau 2 giây
      await fetchUserTickets(userId);
      setTimeout(() => {
        setTicketFlow('list');
        setTicketMsg(null);
      }, 2000);

    } catch (err: any) {
      console.error('Lỗi tạo ticket hỗ trợ:', err);
      setTicketMsg({ type: 'error', text: err.message || 'Lỗi hệ thống, không thể gửi yêu cầu.' });
    } finally {
      setTicketSaving(false);
    }
  };

  // Parse các tin nhắn của Ticket từ cột note
  const getTicketMessages = (ticket: SupportTicket): TicketMessage[] => {
    try {
      const parsed = JSON.parse(ticket.note);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // fallback nếu note là text thường kiểu cũ
    }
    return [
      {
        role: 'customer',
        message: ticket.note || 'Không có nội dung mô tả chi tiết.',
        created_at: ticket.created_at
      }
    ];
  };

  // Khách hàng chat thêm trong Ticket Chat Room
  const handleSendTicketMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!ticketChatInput.trim() && !pendingImage) || !activeTicket || isSendingTicketMsg) return;

    const msgText = ticketChatInput.trim();
    setTicketChatInput('');
    setIsSendingTicketMsg(true);

    try {
      // Đọc các tin nhắn hiện có từ activeTicket
      const currentMessages = getTicketMessages(activeTicket);
      
      // Tạo tin nhắn mới của khách hàng
      const newMsg: TicketMessage = {
        role: 'customer',
        message: msgText,
        image_url: pendingImage || undefined,
        created_at: new Date().toISOString()
      };
      
      const updatedMessages = [...currentMessages, newMsg];
      const updatedNoteJson = JSON.stringify(updatedMessages);

      // Cập nhật cột note trong database
      const { error } = await supabase
        .from('support_tickets')
        .update({ note: updatedNoteJson })
        .eq('id', activeTicket.id);

      if (error) throw error;

      // Cập nhật state cục bộ để hiển thị ngay lập tức
      const updatedTicket: SupportTicket = {
        ...activeTicket,
        note: updatedNoteJson
      };
      setActiveTicket(updatedTicket);
      
      // Đồng thời cập nhật danh sách tickets để đồng bộ
      setTicketsList(prev => prev.map(t => t.id === activeTicket.id ? updatedTicket : t));
      setPendingImage(null);
      
      // Cuộn xuống đáy chat
      scrollTicketChatToBottom();
    } catch (err: any) {
      console.error('Lỗi gửi tin nhắn ticket:', err);
      alert('Không thể gửi tin nhắn: ' + err.message);
    } finally {
      setIsSendingTicketMsg(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa lịch sử cuộc trò chuyện này không?')) {
      const isCurrentAdmin = pathname.startsWith('/admin');
      const { sessionKey, historyKey } = getStorageKeys(isCurrentAdmin, userId);
      
      // Xóa lịch sử cũ & tạo session_id mới hoàn toàn để xoá bộ nhớ LangGraph cũ
      localStorage.removeItem(historyKey);
      const newSessionId = (isCurrentAdmin ? 'admin_sess_' : 'sess_') + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(sessionKey, newSessionId);
      setSessionId(newSessionId);

      setMessages([
        {
          id: 'welcome',
          role: 'agent',
          message: isCurrentAdmin
            ? 'Xin chào Admin! Tôi là Trợ lý AI Nội bộ (Admin Assistant) hỗ trợ quản trị hệ thống. Tôi có thể giúp gì cho bạn hôm nay? (Ví dụ: tra cứu doanh thu, chính sách hoàn tiền, hoặc quy trình xử lý ticket)'
            : 'Lịch sử chat đã được làm sạch. Bạn cần mình tư vấn thiết bị nào hôm nay?',
          created_at: new Date(),
        },
      ]);
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);

  const getTicketStatusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      open: { cls: 'bg-rose-500/10 text-rose-600 border-rose-500/20', label: 'Chờ tiếp nhận' },
      in_progress: { cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20', label: 'Đang xử lý' },
      resolved: { cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'Đã phản hồi / Xong' }
    };
    const s = map[status] || { cls: 'bg-muted text-muted-foreground', label: status };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${s.cls}`}>{s.label}</span>;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* KHUNG CỬA SỔ CHAT POPUP */}
      {isOpen && (
        <div className="mb-4 w-[360px] sm:w-[400px] h-[520px] rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          
          {/* HEADER CHAT */}
          <div className="bg-muted border-b border-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
                  <Bot className="w-5 h-5" />
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success rounded-full border-2 border-card animate-pulse"></span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground leading-tight">
                  {isAdminPage ? 'Trợ lý AI Nội bộ (Admin)' : 'Trực tuyến tư vấn'}
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {isAdminPage ? 'Hệ thống hỗ trợ quản trị' : 'Hệ thống hỗ trợ khách hàng'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {chatMode === 'bot' && (
                <button
                  onClick={handleClearHistory}
                  className="text-[10px] sm:text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-background transition-colors"
                  title="Xóa lịch sử chat"
                >
                  Xóa lịch sử
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* TAB SELECTOR (CHUYỂN BOT CHAT / TẠO TICKET NHÂN VIÊN) */}
          {!isAdminPage && (
            <div className="flex border-b border-border bg-muted/20 text-xs">
              <button
                onClick={() => setChatMode('bot')}
                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 font-bold transition-all border-b-2 cursor-pointer ${
                  chatMode === 'bot'
                    ? 'border-primary text-foreground bg-card'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Bot className="w-4 h-4" />
                <span>Trợ lý AI</span>
              </button>
              <button
                onClick={() => {
                  setChatMode('staff');
                  setTicketFlow('list'); // Mặc định về danh sách khi mở tab gặp nhân viên
                  if (userId) fetchUserTickets(userId);
                }}
                className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 font-bold transition-all border-b-2 cursor-pointer ${
                  chatMode === 'staff'
                    ? 'border-primary text-foreground bg-card'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Gặp nhân viên</span>
              </button>
            </div>
          )}

          {/* ==================================== */}
          {/* PHÂN HỆ CHAT CHÍNH (CHAT VỚI BOT AI) */}
          {/* ==================================== */}
          {chatMode === 'bot' ? (
            <>
              {/* BODY CHAT - TIN NHẮN */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm scrollbar-thin">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-xs sm:text-sm leading-relaxed shadow-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-card border border-border text-foreground rounded-tl-none'
                      }`}
                    >
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm">
                        <Markdown>{msg.message}</Markdown>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Tin nhắn đang nhập */}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-card border border-border rounded-2xl rounded-tl-none p-3 shadow-sm flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Footer gõ tin nhắn */}
              <form onSubmit={handleSend} className="p-3 border-t border-border bg-card flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Hỏi về sản phẩm, chính sách đổi trả..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 h-10 px-4 rounded-xl border border-border bg-background text-foreground placeholder-muted-foreground/60 text-xs sm:text-sm focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-2.5 rounded-xl bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground shadow-md shadow-primary/10 active:scale-95 transition-all cursor-pointer"
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </form>
            </>
          ) : (
            // ===========================================
            // PHÂN HỆ GẶP NHÂN VIÊN (KHÁCH TỰ QUẢN LÝ TICKET)
            // ===========================================
            <>
              {!userId ? (
                // Nếu chưa đăng nhập tài khoản
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="p-3 bg-destructive/10 text-destructive rounded-full border border-destructive/20">
                    <AlertCircle className="w-8 h-8 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-foreground text-sm">Yêu cầu đăng nhập</h4>
                    <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">
                      Vui lòng đăng nhập tài khoản của bạn để có thể gửi yêu cầu hỗ trợ trực tiếp đến nhân viên.
                    </p>
                  </div>
                  <Link 
                    href="/auth/login" 
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
                  >
                    Đăng nhập ngay
                  </Link>
                </div>
              ) : (
                // Đã đăng nhập, điều phối theo ticketFlow
                <div className="flex-1 flex flex-col overflow-hidden bg-background/50">
                  
                  {/* FLOW 1: DANH SÁCH TICKET HỖ TRỢ ĐÃ TẠO */}
                  {ticketFlow === 'list' && (
                    <div className="flex-1 flex flex-col p-4 overflow-hidden">
                      <div className="flex justify-between items-center border-b border-border pb-3 mb-3 flex-shrink-0">
                        <div>
                          <h4 className="font-extrabold text-sm text-foreground">Yêu cầu hỗ trợ của bạn</h4>
                          <p className="text-[10px] text-muted-foreground">Theo dõi và chat trực tiếp với nhân viên</p>
                        </div>
                        <button
                          onClick={() => setTicketFlow('create')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Tạo mới</span>
                        </button>
                      </div>

                      {/* List tickets */}
                      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                        {isTicketsLoading ? (
                          <div className="flex items-center justify-center py-10">
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                          </div>
                        ) : ticketsList.length === 0 ? (
                          <div className="text-center py-12 border border-dashed border-border rounded-xl space-y-2">
                            <AlertCircle className="w-7 h-7 text-muted-foreground mx-auto" />
                            <p className="text-muted-foreground text-[11px]">Bạn chưa gửi yêu cầu hỗ trợ nào.</p>
                          </div>
                        ) : (
                          ticketsList.map(t => {
                            const lastMsg = getTicketMessages(t).slice(-1)[0]?.message || 'Không có tin nhắn';
                            return (
                              <div
                                key={t.id}
                                onClick={() => {
                                  setActiveTicket(t);
                                  setTicketFlow('chat');
                                }}
                                className="p-3 rounded-xl border border-border bg-card/65 hover:bg-card hover:border-primary/40 cursor-pointer transition-all duration-200 space-y-1.5 text-left"
                              >
                                <div className="flex justify-between items-start">
                                  <span className="text-[11px] font-bold text-foreground capitalize">
                                    {t.category === 'advisory' ? 'Tư vấn' : t.category === 'negotiation' ? 'Đàm phán giá' : t.category === 'technical' ? 'Kỹ thuật' : 'Khác'}
                                  </span>
                                  {getTicketStatusBadge(t.status)}
                                </div>
                                <p className="text-[10px] text-muted-foreground line-clamp-1">{lastMsg}</p>
                                <div className="flex justify-between items-center text-[9px] text-muted-foreground/80 pt-1">
                                  <span>Mã: #{t.id.substring(0, 8)}...</span>
                                  <span>{new Date(t.created_at).toLocaleDateString('vi-VN')}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* FLOW 2: FORM TẠO TICKET MỚI */}
                  {ticketFlow === 'create' && (
                    <form onSubmit={handleCreateStaffTicket} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs scrollbar-thin text-left">
                      <div className="flex items-center gap-2 border-b border-border/60 pb-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setTicketFlow('list')}
                          className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div>
                          <h4 className="font-bold text-foreground text-sm">Gửi yêu cầu mới</h4>
                          <p className="text-[10px] text-muted-foreground">Nhân viên hỗ trợ sẽ được chỉ định ngay</p>
                        </div>
                      </div>

                      {ticketMsg && (
                        <div className={`p-3 rounded-xl border text-[10px] flex items-center gap-2 ${
                          ticketMsg.type === 'success' 
                            ? 'border-success/20 bg-success/5 text-success' 
                            : 'border-destructive/20 bg-destructive/5 text-destructive'
                        }`}>
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>{ticketMsg.text}</span>
                        </div>
                      )}

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="font-bold text-muted-foreground">Danh mục hỗ trợ</label>
                          <select
                            value={ticketCategory}
                            onChange={(e) => setTicketCategory(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer"
                          >
                            <option value="advisory">Tư vấn mua hàng / Thông số kỹ thuật</option>
                            <option value="negotiation">Đàm phán giá / Khuyến mãi</option>
                            <option value="technical">Hỗ trợ kỹ thuật sản phẩm</option>
                            <option value="other">Ý kiến khác / Góp ý</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="font-bold text-muted-foreground">Đơn hàng liên quan (Không bắt buộc)</label>
                          <select
                            value={ticketOrderId}
                            onChange={(e) => setTicketOrderId(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer"
                          >
                            <option value="">-- Không liên quan --</option>
                            {userOrders.map((o) => (
                              <option key={o.id} value={o.id}>
                                Đơn #{o.id.substring(0, 8)}... ({formatPrice(o.total)})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="font-bold text-muted-foreground">Mô tả sự cố / Yêu cầu chi tiết</label>
                          <textarea
                            rows={3}
                            value={ticketNote}
                            onChange={(e) => setTicketNote(e.target.value)}
                            placeholder="Nhập mô tả chi tiết sự cố hoặc thông tin cần hỗ trợ..."
                            className="w-full p-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary resize-none"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={ticketSaving}
                        className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground font-bold transition-all active:scale-[0.98] cursor-pointer"
                      >
                        {ticketSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        <span>Gửi yêu cầu hỗ trợ</span>
                      </button>
                    </form>
                  )}

                  {/* FLOW 3: PHÒNG CHAT CHI TIẾT TICKET 2 CHIỀU VỚI NHÂN VIÊN */}
                  {ticketFlow === 'chat' && activeTicket && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Sub-header Chat ticket */}
                      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setTicketFlow('list');
                              fetchUserTickets(userId);
                            }}
                            className="p-1 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <div className="text-left">
                            <h4 className="font-bold text-xs text-foreground line-clamp-1">Mã Ticket: #{activeTicket.id.substring(0, 8)}...</h4>
                            <span className="text-[9px] text-muted-foreground capitalize">
                              Danh mục: {activeTicket.category === 'advisory' ? 'Tư vấn' : activeTicket.category === 'technical' ? 'Kỹ thuật' : 'Khác'}
                            </span>
                          </div>
                        </div>
                        {getTicketStatusBadge(activeTicket.status)}
                      </div>

                      {/* Khung tin nhắn ticket chat */}
                      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs scrollbar-thin">
                        {getTicketMessages(activeTicket).map((msg, idx) => (
                          <div
                            key={idx}
                            className={`flex ${msg.role === 'customer' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className="flex flex-col space-y-0.5 max-w-[85%]">
                              {/* Tên người gửi nhỏ */}
                              <span className={`text-[8px] text-muted-foreground block ${msg.role === 'customer' ? 'text-right' : 'text-left'}`}>
                                {msg.role === 'customer' ? 'Bạn' : 'Nhân viên Hỗ trợ'}
                              </span>
                              
                              <div
                                className={`rounded-xl p-2.5 leading-relaxed shadow-sm text-[11px] text-left ${
                                  msg.role === 'customer'
                                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                                    : 'bg-card border border-border text-foreground rounded-tl-none'
                                  }`}
                              >
                                {msg.message && <p className="whitespace-pre-wrap">{msg.message}</p>}
                                
                                {/* HIỂN THỊ ẢNH ĐÍNH KÈM CỦA TIN NHẮN TICKET PHÍA KHÁCH HÀNG */}
                                {msg.image_url && (
                                  <div className="mt-1.5 max-w-[160px] overflow-hidden rounded-lg border border-border/40">
                                    <img 
                                      src={msg.image_url} 
                                      alt="đính kèm" 
                                      className="w-full h-auto object-cover cursor-pointer hover:scale-105 transition-all"
                                      onClick={() => window.open(msg.image_url, '_blank')}
                                    />
                                  </div>
                                )}
                              </div>
                              <span className={`text-[7px] text-muted-foreground/80 block ${msg.role === 'customer' ? 'text-right' : 'text-left'}`}>
                                {new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        ))}
                        <div ref={ticketChatEndRef} />
                      </div>

                      {/* Form chat gửi tin nhắn trong ticket kèm nút đính kèm ảnh */}
                      <form onSubmit={handleSendTicketMessage} className="p-2.5 border-t border-border bg-card flex flex-col gap-2 flex-shrink-0">
                        {/* Ảnh preview trước khi gửi */}
                        {pendingImage && (
                          <div className="relative w-12 h-12 rounded-lg border border-border overflow-hidden bg-muted self-start flex-shrink-0 group">
                            <img src={pendingImage} alt="preview" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setPendingImage(null)}
                              className="absolute top-0 right-0 p-0.5 bg-black/60 rounded-bl-lg text-white hover:text-destructive transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <div className="flex gap-2 items-center">
                          {/* Nút đính kèm ảnh */}
                          <label className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-all flex-shrink-0">
                            <Plus className="w-4 h-4" />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageSelect}
                              className="hidden"
                            />
                          </label>

                          <input
                            type="text"
                            disabled={activeTicket.status === 'resolved'}
                            placeholder={activeTicket.status === 'resolved' ? 'Ticket này đã đóng.' : 'Gõ tin nhắn gửi nhân viên...'}
                            value={ticketChatInput}
                            onChange={(e) => setTicketChatInput(e.target.value)}
                            className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground/60 text-xs focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <button
                            type="submit"
                            disabled={(!ticketChatInput.trim() && !pendingImage) || activeTicket.status === 'resolved' || isSendingTicketMsg}
                            className="p-2 rounded-lg bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground shadow-sm active:scale-95 transition-all cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                </div>
              )}
            </>
          )}

        </div>
      )}

      {/* 2. NÚT BẤM BONG BÓNG TRÒN NỔI BẬT */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full bg-primary hover:opacity-95 text-primary-foreground flex items-center justify-center shadow-2xl shadow-primary/35 hover:scale-105 active:scale-95 transition-all cursor-pointer relative"
        title="Trò chuyện với trợ lý AI"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <MessageSquare className="w-6 h-6 animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-success"></span>
            </span>
          </>
        )}
      </button>
    </div>
  );
}
