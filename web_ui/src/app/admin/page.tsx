'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  Package,
  ShoppingBag,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  LayoutDashboard,
  Search,
  AlertCircle,
  Users,
  LifeBuoy,
  TrendingUp,
  Shield,
  Activity,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  Info,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import Link from 'next/link';

interface Product {
  id: string;
  category: string;
  brand: string;
  name: string;
  price: number;
  original_price?: number;
  discount?: number;
  stock: number;
  description: string;
  specs: Record<string, string>;
  images: string[];
  rating_avg: number;
}

interface SpecRow {
  key: string;
  value: string;
}

interface VariantRow {
  label: string;
  price: string;
  ram: string;
  storage: string;
}

interface ColorRow {
  name: string;  // Tên màu tiếng Việt
  image: string; // URL ảnh của màu
}

interface VariantTag {
  id: string;
  type: 'color' | 'ram_rom' | 'condition' | 'policy';
  value: string;
  colorCode?: string;
}

interface VariantSpec {
  id: string;
  price: string;
  tagIds: string[];
  image?: string;
}

const CATEGORIES = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'phone', label: 'Điện thoại' },
  { value: 'smartwatch', label: 'Đồng hồ' },
  { value: 'earphone', label: 'Tai nghe' },
  { value: 'accessory', label: 'Phụ kiện' },
  { value: 'tv', label: 'Tivi' },
];

const FALLBACK_PRODUCTS: Product[] = [
  { id: 'prod-1', category: 'laptop', brand: 'Apple', name: 'MacBook Air M3 13 inch', price: 27990000, stock: 15, description: 'MacBook Air M3 siêu mỏng nhẹ, hiệu năng cao.', specs: { "cpu": "M3", "ram": "8GB" }, images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600'], rating_avg: 4.8 },
  { id: 'prod-6', category: 'phone', brand: 'Apple', name: 'iPhone 15 Pro Max 256GB', price: 29990000, stock: 25, description: 'Khung Titanium, camera zoom 5x, A17 Pro.', specs: { "cpu": "A17 Pro", "screen": "6.7 inch" }, images: ['https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600'], rating_avg: 4.8 },
  { id: 'prod-7', category: 'phone', brand: 'Samsung', name: 'Samsung Galaxy S24 Ultra 256GB', price: 26990000, stock: 2, description: 'Galaxy AI, bút S Pen, camera 200MP.', specs: { "cpu": "Snapdragon 8 Gen 3" }, images: ['https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600'], rating_avg: 4.7 },
  { id: 'prod-13', category: 'earphone', brand: 'Apple', name: 'AirPods Pro Gen 2 USB-C', price: 5690000, stock: 0, description: 'Chống ồn ANC mạnh, âm thanh không gian.', specs: { "anc": "Yes" }, images: ['https://images.unsplash.com/photo-1588449668338-d134ae7f3639?w=600'], rating_avg: 4.8 },
];

const MOCK_ORDERS = [
  { id: 'ord_1', created_at: '2026-07-04T08:30:00Z', status: 'shipping', total: 5690000, shipping_address: 'Nguyễn Văn A - SĐT: 0987654321 - ĐC: 123 Cầu Giấy, Hà Nội', items: [{ name: 'AirPods Pro Gen 2', quantity: 1, price: 5690000, image: 'https://images.unsplash.com/photo-1588449668338-d134ae7f3639?w=600' }] },
  { id: 'ord_2', created_at: '2026-06-20T14:15:00Z', status: 'delivered', total: 28980000, shipping_address: 'Trần Thị B - SĐT: 0912345678 - ĐC: 45 Lê Lợi, TP.HCM', items: [{ name: 'MacBook Air M3', quantity: 1, price: 27990000, image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600' }, { name: 'Sạc Anker 67W', quantity: 1, price: 990000, image: 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600' }] },
];

const MOCK_TICKETS = [
  { id: 'tk_1', customer_id: 'cust_1', category: 'technical', risk_level: 'medium', created_by: 'customer', status: 'open', note: 'Sản phẩm tai nghe AirPods bị rè bên tai trái, tôi muốn đổi trả.', created_at: '2026-07-04T10:00:00Z', user_email: 'khachhang.test@gmail.com' },
  { id: 'tk_2', customer_id: 'cust_2', category: 'negotiation', risk_level: 'high', created_by: 'agent', status: 'in_progress', note: 'AI Chatbot phát hiện: Khách hàng yêu cầu giảm giá quá 3 lần liên tiếp cho iPhone 15.', created_at: '2026-07-04T09:15:00Z', user_email: 'user.oauth@gmail.com' }
];

const emptyForm: Product = {
  id: '', category: 'laptop', brand: '', name: '', price: 0, original_price: 0, discount: 0, stock: 0, description: '',
  specs: {}, images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600'], rating_avg: 5,
};

type ActivePanel = 'dashboard' | 'products' | 'orders' | 'users' | 'tickets';

export default function AdminPage() {
  const [panel, setPanel] = useState<ActivePanel>('dashboard');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isTicketsLoading, setIsTicketsLoading] = useState(false);
  
  // Search & Filters
  const [prodSearch, setProdSearch] = useState('');
  const [prodFilterCategory, setProdFilterCategory] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [ticketFilterStatus, setTicketFilterStatus] = useState('');
  const [chartTab, setChartTab] = useState<'today' | 'week' | 'month'>('month');
  const [selectedTimePoint, setSelectedTimePoint] = useState<string | null>(null);
  const [selectedSubChartMonth, setSelectedSubChartMonth] = useState<string | null>(null);
  const [chartAnchorDate, setChartAnchorDate] = useState<Date>(new Date());

  const handleChartTabChange = (tab: 'today' | 'week' | 'month') => {
    setChartTab(tab);
    setChartAnchorDate(new Date());
    setSelectedTimePoint(null);
    setSelectedSubChartMonth(null);
  };

  const shiftChartDate = (direction: 'prev' | 'next') => {
    const offset = direction === 'prev' ? -1 : 1;
    setSelectedTimePoint(null);
    setSelectedSubChartMonth(null);
    
    setChartAnchorDate(prev => {
      const newDate = new Date(prev.getTime());
      if (chartTab === 'today') {
        newDate.setDate(prev.getDate() + offset);
      } else if (chartTab === 'week') {
        newDate.setDate(prev.getDate() + offset * 7);
      } else if (chartTab === 'month') {
        newDate.setFullYear(prev.getFullYear() + offset);
      }
      return newDate;
    });
  };

  // Product Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formProduct, setFormProduct] = useState<Product>(emptyForm);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountInputStr, setDiscountInputStr] = useState<string>('');
  const [specRows, setSpecRows] = useState<SpecRow[]>([]);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [colorRows, setColorRows] = useState<ColorRow[]>([]);
  const [ramRoms, setRamRoms] = useState<string[]>([]);
  const [newRamRom, setNewRamRom] = useState('');
  const [prodCurrentPage, setProdCurrentPage] = useState(1);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const catDropdownRef = useRef<HTMLDivElement>(null);
  const [isFormCatOpen, setIsFormCatOpen] = useState(false);
  const formCatRef = useRef<HTMLDivElement>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [userOrderStats, setUserOrderStats] = useState<{
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    totalSpent: number;
    totalItems: number;
    categoryBreakdown: Record<string, number>;
    isLoading: boolean;
  } | null>(null);
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<{ userId: string; newRole: string } | null>(null);
  const [activeUserRoleDropdown, setActiveUserRoleDropdown] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userTab, setUserTab] = useState<'staff' | 'customer'>('staff');

  // Tags Pool & Variant Specs States
  const [availableTags, setAvailableTags] = useState<VariantTag[]>([]);
  const [variantSpecs, setVariantSpecs] = useState<VariantSpec[]>([]);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(0);
  const [newTagType, setNewTagType] = useState<'color' | 'ram_rom' | 'condition' | 'policy'>('color');
  const [newConditionVal, setNewConditionVal] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [newColorCode, setNewColorCode] = useState('#2563eb');
  const [newRamVal, setNewRamVal] = useState('');
  const [newRomVal, setNewRomVal] = useState('');
  const [selectedPolicyTagIds, setSelectedPolicyTagIds] = useState<string[]>([]);
  const [newPolicyVal, setNewPolicyVal] = useState('');

  // Trợ lý AI Admin State
  const [adminChatMessages, setAdminChatMessages] = useState<any[]>([
    {
      role: 'assistant',
      content: 'Xin chào Admin! Tôi là Trợ lý AI Nội bộ (Admin Assistant) hỗ trợ quản trị hệ thống. Tôi có thể giúp gì cho bạn hôm nay? (Ví dụ: tra cứu doanh thu, phân tích sản phẩm bán chạy, hoặc chính sách đổi trả)'
    }
  ]);
  const [adminChatInput, setAdminChatInput] = useState('');
  const [isAdminChatLoading, setIsAdminChatLoading] = useState(false);

  const handleSendAdminChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminChatInput.trim() || isAdminChatLoading) return;

    const userMsg = adminChatInput.trim();
    setAdminChatInput('');

    // Thêm tin nhắn của User vào danh sách
    const updatedMessages = [...adminChatMessages, { role: 'user', content: userMsg }];
    setAdminChatMessages(updatedMessages);
    setIsAdminChatLoading(true);

    try {
      // Gửi request tới API chat admin
      const response = await fetch('/api/chat/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          session_id: 'admin-session-' + Date.now()
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lỗi kết nối AI Assistant');

      // Thêm phản hồi của AI Assistant vào danh sách
      setAdminChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || 'Xin lỗi, tôi gặp sự cố khi xử lý câu trả lời.',
          tool_used: data.tool_used,
          sources: data.sources
        }
      ]);
    } catch (err: any) {
      console.error('Lỗi chat AI Admin:', err);
      setAdminChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Lỗi: Không thể kết nối với Trợ lý AI Admin. Vui lòng kiểm tra lại kết nối mạng hoặc máy chủ API.'
        }
      ]);
    } finally {
      setIsAdminChatLoading(false);
    }
  };

  // Order Detail Modal State
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [updatingOrderStatus, setUpdatingOrderStatus] = useState(false);

  // User Role State
  const [updatingUserRole, setUpdatingUserRole] = useState<string | null>(null);

  // Ticket Modal State
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketReplyNote, setTicketReplyNote] = useState('');
  const [updatingTicket, setUpdatingTicket] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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

  // Auth State
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string>('');
  
  const router = useRouter();
  const adminChatEndRef = useRef<HTMLDivElement>(null);

  // Tự động cuộn xuống đáy khi note (tin nhắn) của ticket thay đổi
  const scrollAdminChatToBottom = () => {
    setTimeout(() => {
      adminChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    if (selectedTicket) {
      scrollAdminChatToBottom();
    }
  }, [selectedTicket?.note]);

  // Polling Live Chat - nạp tin nhắn mới mỗi 3 giây khi đang mở Modal
  useEffect(() => {
    if (!selectedTicket || !isSupabaseConfigured) return;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('id', selectedTicket.id)
          .single();
        if (!error && data) {
          // Chỉ cập nhật nếu có tin nhắn mới hoặc đổi status
          if (data.note !== selectedTicket.note || data.status !== selectedTicket.status) {
            setSelectedTicket(data);
            setTickets(prev => prev.map(t => t.id === data.id ? data : t));
          }
        }
      } catch (e) {
        console.error('Lỗi Polling ticket chat:', e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedTicket?.id, selectedTicket?.note, selectedTicket?.status]);

  useEffect(() => {
    const checkAdminRoleAndLoadData = async () => {
      setIsLoading(true);
      
      if (!isSupabaseConfigured) {
        setIsAdmin(true);
        setProducts(FALLBACK_PRODUCTS);
        setOrders(MOCK_ORDERS);
        setTickets(MOCK_TICKETS);
        setUsers([
          { id: '1', email: 'vugiakhai2004@gmail.com', user_metadata: { full_name: 'Vũ Gia Khải', role: 'admin' }, created_at: '2026-07-04' },
          { id: '2', email: 'nhanvien.test@gmail.com', user_metadata: { full_name: 'Nguyễn Văn Staff', role: 'staff' }, created_at: '2026-07-01' },
          { id: '3', email: 'khachhang.test@gmail.com', user_metadata: { full_name: 'Trần Thị Customer' }, created_at: '2026-07-02' }
        ]);
        setIsLoading(false);
        return;
      }

      try {
        const { data: { user }, error: authErr } = await supabase.auth.getUser();

        if (authErr || !user) {
          setAuthError('Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn!');
          setIsAdmin(false);
          setTimeout(() => { router.push('/auth/login'); }, 2000);
          return;
        }

        // Quyền admin: role === 'admin' hoặc email chỉ định
        const userRole = user.user_metadata?.role;
        const isUserAdmin = userRole === 'admin' || user.email === 'admin@gmail.com' || user.email === 'vugiakhai2004@gmail.com' || user.email?.toLowerCase().includes('admin');

        if (!isUserAdmin) {
          setAuthError('Tài khoản của bạn không có đặc quyền Admin! Đang chuyển hướng...');
          setIsAdmin(false);
          setTimeout(() => { router.push('/account'); }, 2500);
          return;
        }

        setIsAdmin(true);

        // Load Products từ Supabase thật sử dụng range song song kèm order id và khử trùng lặp để tránh trùng key
        const [batch1, batch2] = await Promise.all([
          supabase.from('products').select('*').order('id', { ascending: false }).range(0, 999),
          supabase.from('products').select('*').order('id', { ascending: false }).range(1000, 1999)
        ]);
        
        let prodData = null;
        let prodErr = batch1.error || batch2.error;
        if (!prodErr) {
          const rawData = [...(batch1.data || []), ...(batch2.data || [])];
          const seen = new Set();
          prodData = rawData.filter(p => {
            if (seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        }

        if (!prodErr && prodData) {
          setProducts(prodData.map(p => {
            const images = [];
            if (p.image_url) images.push(p.image_url);
            else if (p.thumbnail) images.push(p.thumbnail);
            else images.push('https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600');
            
            const original_price = p.price || 0;
            const final_price = p.final_price || original_price;
            const discount = original_price > 0 && final_price < original_price
              ? Math.round(((original_price - final_price) / original_price) * 100)
              : 0;

            return {
              ...p,
              images,
              price: final_price, // Ánh xạ price của UI thành final_price thực tế trong DB
              original_price: original_price,
              discount: discount,
              specs: typeof p.specs === 'string' ? JSON.parse(p.specs) : (p.specs || {})
            };
          }));
        } else {
          setProducts(FALLBACK_PRODUCTS);
        }

        // Load Orders qua API admin (service role, bypass RLS) để thấy toàn bộ đơn hàng
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Không tìm thấy token phiên đăng nhập');
          const orderRes = await fetch('/api/admin/orders', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const orderJson = await orderRes.json();
          if (!orderRes.ok) throw new Error(orderJson.error || 'Lỗi tải đơn hàng');
          setOrders(orderJson.orders || []);
        } catch (orderErr) {
          console.error('Lỗi tải đơn hàng:', orderErr);
          setOrders(MOCK_ORDERS);
        }

        // Load Support Tickets
        const { data: ticketData, error: ticketErr } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
        if (!ticketErr && ticketData) {
          setTickets(ticketData);
        } else {
          setTickets(MOCK_TICKETS);
        }

      } catch (err) {
        console.error('Lỗi khi tải dữ liệu admin:', err);
        setProducts(FALLBACK_PRODUCTS);
        setOrders(MOCK_ORDERS);
        setTickets(MOCK_TICKETS);
        setIsAdmin(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminRoleAndLoadData();
  }, [router]);

  // Load Users qua API Route (phải truyền token xác thực)
  const fetchUsersList = async () => {
    setIsUsersLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) throw new Error('Không tìm thấy token phiên đăng nhập');

      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Lỗi tải danh sách người dùng');
      setUsers(data.users || []);
    } catch (err: any) {
      console.error('Lỗi fetch users:', err);
      alert(err.message || 'Lỗi hệ thống khi tải danh sách người dùng');
    } finally {
      setIsUsersLoading(false);
    }
  };

  useEffect(() => {
    if (panel === 'users' && isSupabaseConfigured) {
      fetchUsersList();
    }
  }, [panel]);

  useEffect(() => {
    setProdCurrentPage(1);
  }, [prodSearch, prodFilterCategory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target as Node)) {
        setIsCatDropdownOpen(false);
      }
      if (formCatRef.current && !formCatRef.current.contains(event.target as Node)) {
        setIsFormCatOpen(false);
      }
      // Đóng dropdown gán role của user
      const target = event.target as Element;
      if (!target.closest('.role-dropdown-container')) {
        setActiveUserRoleDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Đổi Role cho User
  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    if (!isAdmin) {
      alert('Chỉ tài khoản Quản trị viên (Admin) mới có quyền gán vai trò người dùng!');
      return;
    }
    setUpdatingUserRole(userId);
    try {
      if (!isSupabaseConfigured) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, user_metadata: { ...u.user_metadata, role: newRole } } : u));
        if (selectedUserDetail && selectedUserDetail.id === userId) {
          setSelectedUserDetail((prev: any) => ({ ...prev, user_metadata: { ...prev.user_metadata, role: newRole } }));
        }
        alert('Cập nhật vai trò thành công (offline mode)');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Hết phiên đăng nhập');

      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, role: newRole })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cập nhật vai trò thất bại');
      
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, user_metadata: { ...u.user_metadata, role: newRole } } : u));
      if (selectedUserDetail && selectedUserDetail.id === userId) {
        setSelectedUserDetail((prev: any) => ({ ...prev, user_metadata: { ...prev.user_metadata, role: newRole } }));
      }
      alert('Đã cập nhật quyền thành công!');
    } catch (err: any) {
      console.error('Lỗi đổi role:', err);
      alert(err.message || 'Lỗi không thể cập nhật quyền');
    } finally {
      setUpdatingUserRole(null);
    }
  };

  // Cập nhật trạng thái đơn hàng
  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    setUpdatingOrderStatus(true);
    try {
      if (!isSupabaseConfigured) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        if (selectedOrder) setSelectedOrder((prev: any) => ({ ...prev, status: newStatus }));
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Hết phiên đăng nhập');

      const response = await fetch('/api/admin/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ orderId, status: newStatus })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cập nhật trạng thái thất bại');

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      if (selectedOrder) setSelectedOrder((prev: any) => ({ ...prev, status: newStatus }));
      alert('Cập nhật trạng thái đơn hàng thành công!');
    } catch (err: any) {
      console.error('Lỗi cập nhật đơn hàng:', err);
      alert('Lỗi: ' + err.message);
    } finally {
      setUpdatingOrderStatus(false);
    }
  };

  // Cập nhật trạng thái Ticket
  const handleUpdateTicket = async (ticketId: string, newStatus: 'open' | 'in_progress' | 'resolved') => {
    setUpdatingTicket(true);
    try {
      const payload = { status: newStatus };

      if (!isSupabaseConfigured) {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...payload } : t));
        setSelectedTicket((prev: any) => ({ ...prev, ...payload }));
        alert('Cập nhật trạng thái Ticket thành công (offline mode)');
        return;
      }

      const { error } = await supabase
        .from('support_tickets')
        .update(payload)
        .eq('id', ticketId);

      if (error) throw error;

      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, ...payload } : t));
      setSelectedTicket((prev: any) => ({ ...prev, ...payload }));
      alert('Cập nhật trạng thái Ticket thành công!');
    } catch (err: any) {
      console.error('Lỗi cập nhật trạng thái ticket:', err);
      alert('Lỗi: ' + err.message);
    } finally {
      setUpdatingTicket(false);
    }
  };

  // Nhân viên gửi tin nhắn trả lời trong Ticket chat (Ghi đè cột note dạng JSON)
  const handleSendTicketReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!ticketReplyNote.trim() && !pendingImage) || !selectedTicket || updatingTicket) return;

    const replyMsgText = ticketReplyNote.trim();
    setUpdatingTicket(true);

    try {
      // Đọc các tin nhắn hiện có từ note
      let currentMessages: any[] = [];
      try {
        const parsed = JSON.parse(selectedTicket.note);
        if (Array.isArray(parsed)) currentMessages = parsed;
      } catch (e) {
        currentMessages = [
          { role: 'customer', message: selectedTicket.note || 'Không có mô tả chi tiết.', created_at: selectedTicket.created_at }
        ];
      }

      // Tạo tin nhắn mới của nhân viên
      const newMsg = {
        role: 'staff',
        message: replyMsgText,
        image_url: pendingImage || undefined,
        created_at: new Date().toISOString()
      };

      const updatedMessages = [...currentMessages, newMsg];
      const updatedNoteJson = JSON.stringify(updatedMessages);

      const payload = {
        note: updatedNoteJson,
        status: selectedTicket.status === 'open' ? 'in_progress' : selectedTicket.status // tự động chuyển thành in_progress để báo đang xử lý
      };

      if (!isSupabaseConfigured) {
        const updatedTicket = { ...selectedTicket, ...payload };
        setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t));
        setSelectedTicket(updatedTicket);
        setTicketReplyNote('');
        setPendingImage(null);
        return;
      }

      const { error } = await supabase
        .from('support_tickets')
        .update(payload)
        .eq('id', selectedTicket.id);

      if (error) throw error;

      const updatedTicket = { ...selectedTicket, ...payload };
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? updatedTicket : t));
      setSelectedTicket(updatedTicket);
      setTicketReplyNote('');
      setPendingImage(null);
    } catch (err: any) {
      console.error('Lỗi gửi phản hồi ticket:', err);
      alert('Lỗi: ' + err.message);
    } finally {
      setUpdatingTicket(false);
    }
  };

  // Thêm/Sửa sản phẩm
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProduct(true);

    // Convert danh sách Specs Key-Value từ form sang Object JSON
    const specsObject: Record<string, any> = {};
    specRows.forEach(row => {
      if (row.key.trim()) specsObject[row.key.trim()] = row.value.trim();
    });

    // Lưu trữ nguyên vẹn Kho thẻ thuộc tính (Tags Pool) của sản phẩm
    specsObject.available_tags = availableTags;

    // Lưu danh sách chính sách bảo hành & ưu đãi được gán
    const policyTags = selectedPolicyTagIds
      .map(id => availableTags.find(t => t.id === id))
      .filter(Boolean)
      .map(t => t!.value);
    specsObject.policy_tags = policyTags;

    // Đóng gói Variants từ variantSpecs và availableTags
    const variantsList: any[] = [];
    variantSpecs.forEach(vs => {
      // Tìm các tag màu, tag ram_rom và tag tình trạng đã gán
      const tags = vs.tagIds.map(tid => availableTags.find(t => t.id === tid)).filter(Boolean) as VariantTag[];
      const colorTag = tags.find(t => t.type === 'color');
      const ramRomTag = tags.find(t => t.type === 'ram_rom');
      const condTag = tags.find(t => t.type === 'condition');
      
      // Tạo label
      const colorVal = colorTag ? colorTag.value : '';
      const ramRomVal = ramRomTag ? ramRomTag.value : '';
      const condVal = condTag ? condTag.value : '';
      let label = '';
      const labelParts = [];
      if (colorVal) labelParts.push(colorVal);
      if (ramRomVal) labelParts.push(ramRomVal);
      if (condVal) labelParts.push(condVal);
      label = labelParts.length > 0 ? labelParts.join(' - ') : formProduct.name;
      
      // Trích xuất RAM và ROM
      let ram = '';
      let storage = '';
      if (ramRomVal) {
        const parts = ramRomVal.split('/');
        ram = parts[0] || '';
        storage = parts[1] || '';
      }

      variantsList.push({
        label,
        price: Number(vs.price) || Number(formProduct.price),
        ram,
        storage,
        color: colorVal,
        color_code: colorTag?.colorCode || '',
        condition: condVal,
        image: vs.image || ''
      });
    });

    if (variantsList.length > 0) {
      specsObject.variants = variantsList;
      
      // Tự động gom nhóm màu sắc từ các variant gán để điền color_options và color_images tương thích ngược
      const uniqueColors: { name: string; image: string }[] = [];
      variantsList.forEach(v => {
        if (v.color && !uniqueColors.some(c => c.name.toLowerCase() === v.color.toLowerCase())) {
          uniqueColors.push({ name: v.color, image: v.image || formProduct.images?.[0] || '' });
        }
      });
      
      if (uniqueColors.length > 0) {
        specsObject.color_options = uniqueColors.map(c => c.name);
        specsObject.color_images = uniqueColors.map(c => c.image);
      }
    } else {
      // Nếu không có variant, kiểm tra xem có tag màu trong availableTags không
      const colorTags = availableTags.filter(t => t.type === 'color');
      if (colorTags.length > 0) {
        specsObject.color_options = colorTags.map(c => c.value);
        specsObject.color_images = colorTags.map(() => formProduct.images?.[0] || '');
      }
    }

    const originalPriceVal = Number(formProduct.price) || 0;
    const discountVal = discountEnabled ? (Number(formProduct.discount) || 0) : 0;
    const finalPriceVal = discountVal > 0
      ? Math.round(originalPriceVal * (1 - discountVal / 100))
      : originalPriceVal;

    const payload = {
      category: formProduct.category,
      brand: formProduct.brand,
      name: formProduct.name,
      price: originalPriceVal, // Giá gốc chưa giảm
      special_price: discountVal > 0 ? finalPriceVal : null,
      final_price: finalPriceVal, // Giá thực tế bán
      stock: Number(formProduct.stock) || 0,
      description: formProduct.description || '',
      specs: specsObject,
      thumbnail: formProduct.images?.[0] || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600',
      image_url: formProduct.images?.[0] || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600',
    };

    try {
      if (editingProduct) {
        if (isSupabaseConfigured) {
          const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
          if (error) throw error;
        }
        
        const updatedProduct = {
          ...payload,
          id: editingProduct.id,
          images: formProduct.images || [],
          price: finalPriceVal, // Ánh xạ price của UI hiển thị final_price thực tế trong DB
          original_price: originalPriceVal,
          discount: discountVal
        };
        setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? (updatedProduct as any) : p)));
      } else {
        // Sinh ID kiểu INT hợp lệ cho Postgres
        const maxId = products.reduce((max, prod) => {
          const numId = Number(prod.id);
          return isNaN(numId) ? max : Math.max(max, numId);
        }, 0);
        const newId = maxId > 0 ? maxId + 1 : Math.round(Date.now() / 1000);

        if (isSupabaseConfigured) {
          const { error } = await supabase.from('products').insert({ ...payload, id: newId });
          if (error) throw error;
        }
        
        const newProduct = {
          ...payload,
          id: newId,
          images: formProduct.images || [],
          price: finalPriceVal, // Ánh xạ price của UI hiển thị final_price thực tế trong DB
          original_price: originalPriceVal,
          discount: discountVal
        };
        setProducts((prev) => [(newProduct as any), ...prev]);
      }
      setModalOpen(false);
      alert('Lưu sản phẩm thành công!');
    } catch (err: any) {
      console.error('Lỗi lưu sản phẩm:', err);
      alert('Lỗi khi lưu sản phẩm: ' + err.message);
    } finally {
      setSavingProduct(false);
    }
  };

  // Xóa sản phẩm
  const handleDeleteProduct = async (p: Product) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa sản phẩm "${p.name}"?`)) return;
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('products').delete().eq('id', p.id);
        if (error) throw error;
      }
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
      alert('Xóa sản phẩm thành công!');
    } catch (err: any) {
      console.error('Lỗi khi xóa:', err);
      alert('Lỗi: ' + err.message);
    }
  };

  // Helper đảm bảo có các tag chính sách mặc định trong mảng
  const ensureDefaultPolicyTags = (tags: VariantTag[]) => {
    const defaultPolicies = [
      'Chính hãng 100%',
      'Giao nhanh toàn quốc',
      'Lỗi 1 đổi 1',
      '1 đổi 1 trong 14 ngày',
      'Miễn phí giao hàng',
      'Trả góp 0% lãi suất',
      'Bảo hành 12 tháng',
      'Giao hỏa tốc 2h',
      'Hoàn tiền 200% nếu giả',
      'Thu cũ đổi mới trợ giá'
    ];
    defaultPolicies.forEach(val => {
      if (!tags.some(t => t.type === 'policy' && t.value.toLowerCase() === val.toLowerCase())) {
        tags.push({
          id: `policy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          type: 'policy',
          value: val
        });
      }
    });
    return tags;
  };

  // Mở modal thêm sản phẩm mới
  const openCreateProduct = () => {
    setEditingProduct(null);
    setFormProduct(emptyForm);
    setSpecRows([]);
    setVariantRows([]);
    setColorRows([]);
    setRamRoms([]);
    setNewRamRom('');
    
    // Tự động tạo kho thẻ chính sách mặc định ban đầu
    const initialTags: VariantTag[] = [];
    ensureDefaultPolicyTags(initialTags);
    setAvailableTags(initialTags);

    setVariantSpecs([]);
    setSelectedVariantIdx(0);
    setNewTagType('color');
    setNewColorName('');
    setNewColorCode('#2563eb');
    setNewRamVal('');
    setNewRomVal('');
    setSelectedPolicyTagIds([]);
    setNewPolicyVal('');
    setDiscountEnabled(false);
    setDiscountInputStr('');
    setModalOpen(true);
  };

  // Mở modal sửa sản phẩm
  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    const hasDiscount = (p.discount || 0) > 0;
    const formPrice = hasDiscount && p.original_price ? p.original_price : p.price;
    setFormProduct({ ...p, price: formPrice, discount: p.discount || 0, original_price: p.original_price || p.price });
    setDiscountEnabled(hasDiscount);
    setDiscountInputStr(hasDiscount ? String(p.discount) : '');


    // Khởi tạo các mảng tag và specs mới
    const parsedTags: VariantTag[] = [];
    const parsedSpecs: VariantSpec[] = [];

    // Lấy màu sắc gán tương thích ngược
    const colorOpts: string[] = (p.specs as any)?.color_options || [];
    const colorImgs: string[] = (p.specs as any)?.color_images || [];
    const cRows: ColorRow[] = colorOpts.map((name, idx) => ({ name, image: colorImgs[idx] || '' }));
    setColorRows(cRows);

    // Kiểm tra xem sản phẩm đã lưu sẵn Kho thẻ thuộc tính chưa
    const dbTags: VariantTag[] = (p.specs as any)?.available_tags || [];
    if (dbTags.length > 0) {
      dbTags.forEach(t => parsedTags.push(t));
    } else {
      // Parse từ color_options (Dành cho sản phẩm cũ chưa nâng cấp)
      colorOpts.forEach((cName) => {
        const tagId = `color-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        parsedTags.push({
          id: tagId,
          type: 'color',
          value: cName,
          colorCode: '#2563eb' // Mặc định
        });
      });
    }

    // Đảm bảo có các tag chính sách mẫu
    ensureDefaultPolicyTags(parsedTags);

    // Parse các chính sách bảo hành & ưu đãi từ specs.policy_tags
    const dbPolicies: string[] = (p.specs as any)?.policy_tags || [];
    const policyIds: string[] = [];
    dbPolicies.forEach(policyText => {
      let matchedTag = parsedTags.find(t => t.type === 'policy' && t.value.toLowerCase() === policyText.toLowerCase());
      if (!matchedTag) {
        const tagId = `policy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        matchedTag = {
          id: tagId,
          type: 'policy',
          value: policyText
        };
        parsedTags.push(matchedTag);
      }
      policyIds.push(matchedTag.id);
    });
    setSelectedPolicyTagIds(policyIds);

    // Parse variants từ DB
    const dbVariants = (p.specs as any)?.variants || [];
    dbVariants.forEach((v: any) => {
      const vTagIds: string[] = [];

      // 1. Xử lý màu sắc
      if (v.color) {
        let matchedColorTag = parsedTags.find(t => t.type === 'color' && t.value.toLowerCase() === v.color.toLowerCase());
        if (!matchedColorTag) {
          const tagId = `color-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          matchedColorTag = {
            id: tagId,
            type: 'color',
            value: v.color,
            colorCode: v.color_code || '#2563eb'
          };
          parsedTags.push(matchedColorTag);
        } else if (v.color_code && matchedColorTag.colorCode === '#2563eb') {
          matchedColorTag.colorCode = v.color_code;
        }
        vTagIds.push(matchedColorTag.id);
      }

      // 2. Xử lý RAM / ROM
      if (v.ram || v.storage) {
        const combined = `${v.ram || ''}/${v.storage || ''}`;
        let matchedRamRomTag = parsedTags.find(t => t.type === 'ram_rom' && t.value === combined);
        if (!matchedRamRomTag) {
          const tagId = `ramrom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          matchedRamRomTag = {
            id: tagId,
            type: 'ram_rom',
            value: combined
          };
          parsedTags.push(matchedRamRomTag);
        }
        vTagIds.push(matchedRamRomTag.id);
      }

      // 3. Xử lý Tình trạng
      if (v.condition) {
        let matchedCondTag = parsedTags.find(t => t.type === 'condition' && t.value.toLowerCase() === v.condition.toLowerCase());
        if (!matchedCondTag) {
          const tagId = `condition-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const newCondTag: VariantTag = {
            id: tagId,
            type: 'condition',
            value: v.condition
          };
          parsedTags.push(newCondTag);
          matchedCondTag = newCondTag;
        }
        if (matchedCondTag) {
          vTagIds.push(matchedCondTag.id);
        }
      }

      // 4. Tạo VariantSpec
      parsedSpecs.push({
        id: `variant-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        price: String(v.price || ''),
        tagIds: vTagIds,
        image: v.image || ''
      });
    });

    setAvailableTags(parsedTags);
    setVariantSpecs(parsedSpecs);
    setSelectedVariantIdx(0);
    setNewTagType('color');
    setNewColorName('');
    setNewColorCode('#2563eb');
    setNewRamVal('');
    setNewRomVal('');
    setNewPolicyVal('');

    // Parse specs object sang key-value (lọc bỏ các key nội bộ và tag nội bộ)
    const INTERNAL_KEYS = new Set(['original_link','ratings_count','color_options','color_images','variants','ram','storage','available_tags','availableTags','policy_tags','policyTags']);
    const rows: SpecRow[] = Object.entries(p.specs || {})
      .filter(([key]) => !INTERNAL_KEYS.has(key))
      .map(([key, value]) => ({ key, value: String(value) }));
    setSpecRows(rows);
    setModalOpen(true);
  };

  // Thêm nhanh 4 màu mẫu
  const handleAddSampleColors = () => {
    const samples = [
      { name: 'Đen Huyền Bí', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600' },
      { name: 'Trắng Ngọc Trai', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600' },
      { name: 'Titan Sa Mạc', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600' },
      { name: 'Xanh Tinh Vân', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600' },
    ];
    const newColors = [...colorRows];
    samples.forEach(s => {
      if (!newColors.some(c => c.name.toLowerCase() === s.name.toLowerCase())) {
        newColors.push(s);
      }
    });
    setColorRows(newColors);
  };

  // Thêm nhanh 3 cấu hình mẫu
  const handleAddSampleRamRoms = () => {
    const samples = ['8GB/256GB', '12GB/512GB', '16GB/1TB'];
    const newRrs = [...ramRoms];
    samples.forEach(s => {
      if (!newRrs.includes(s)) {
        newRrs.push(s);
      }
    });
    setRamRoms(newRrs);
  };

  // Quản lý spec rows động trong form sản phẩm
  const addSpecRow = () => setSpecRows([...specRows, { key: '', value: '' }]);
  const removeSpecRow = (index: number) => setSpecRows(specRows.filter((_, idx) => idx !== index));
  const updateSpecRow = (index: number, field: 'key' | 'value', val: string) =>
    setSpecRows(specRows.map((row, idx) => idx === index ? { ...row, [field]: val } : row));

  // Quản lý variant rows
  const addVariantRow = () => setVariantRows([...variantRows, { label: '', price: '', ram: '', storage: '' }]);
  const removeVariantRow = (index: number) => setVariantRows(variantRows.filter((_, idx) => idx !== index));
  const updateVariantRow = (index: number, field: keyof VariantRow, val: string) =>
    setVariantRows(variantRows.map((row, idx) => idx === index ? { ...row, [field]: val } : row));

  // Quản lý color rows
  const addColorRow = () => setColorRows([...colorRows, { name: '', image: '' }]);
  const removeColorRow = (index: number) => setColorRows(colorRows.filter((_, idx) => idx !== index));
  const updateColorRow = (index: number, field: keyof ColorRow, val: string) =>
    setColorRows(colorRows.map((row, idx) => idx === index ? { ...row, [field]: val } : row));

  // Định dạng hiển thị tiền tệ
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);

  // Định dạng ngày tháng
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  // Trả về màu Badge trạng thái đơn hàng
  const getOrderStatusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      pending: { cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', label: 'Chờ xử lý' },
      processing: { cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', label: 'Đã thanh toán / Xử lý' },
      shipping: { cls: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', label: 'Đang giao hàng' },
      delivered: { cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', label: 'Đã hoàn tất' },
      cancelled: { cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', label: 'Đã hủy đơn' },
    };
    const s = map[status] || { cls: 'bg-muted text-muted-foreground border-border', label: 'Chưa rõ' };
    return <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${s.cls}`}>{s.label}</span>;
  };

  // Trả về màu Badge trạng thái Ticket
  const getTicketStatusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      open: { cls: 'bg-rose-500/10 text-rose-600 border-rose-500/20', label: 'Mới nhận' },
      in_progress: { cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20', label: 'Đang xử lý' },
      resolved: { cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'Đã giải quyết' }
    };
    const s = map[status] || { cls: 'bg-muted text-muted-foreground', label: status };
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${s.cls}`}>{s.label}</span>;
  };

  // Tính toán doanh số Dashboard
  const calculateStats = () => {
    const successfulOrders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'pending');
    const cancelledOrders = orders.filter(o => o.status === 'cancelled');
    
    const totalRevenue = successfulOrders.reduce((acc, cur) => acc + Number(cur.total), 0);
    const lostRevenue = cancelledOrders.reduce((acc, cur) => acc + Number(cur.total), 0);
    const aov = successfulOrders.length > 0 ? Math.round(totalRevenue / successfulOrders.length) : 0;
    const cancelledRate = orders.length > 0 ? Math.round((cancelledOrders.length / orders.length) * 100) : 0;
    
    const seenLowStock = new Set();
    const lowStockProducts = products.filter(p => {
      if (p.stock === null || p.stock === undefined || p.stock > 5) return false;
      if (seenLowStock.has(p.id)) return false;
      seenLowStock.add(p.id);
      return true;
    });
    const outOfStockCount = products.filter((p, idx, self) => p.stock === 0 && self.findIndex(x => x.id === p.id) === idx).length;

    // 1. Thống kê 24 giờ của ngày chartAnchorDate
    const hourlyData: Record<string, number> = {
      '04:00': 0, '08:00': 0, '12:00': 0, '16:00': 0, '20:00': 0, '24:00': 0
    };
    const targetYMD = `${chartAnchorDate.getFullYear()}-${String(chartAnchorDate.getMonth() + 1).padStart(2, '0')}-${String(chartAnchorDate.getDate()).padStart(2, '0')}`;

    successfulOrders.forEach(o => {
      const date = new Date(o.created_at);
      const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (ymd === targetYMD) {
        const hour = date.getHours();
        if (hour < 4) hourlyData['04:00'] += Number(o.total);
        else if (hour < 8) hourlyData['08:00'] += Number(o.total);
        else if (hour < 12) hourlyData['12:00'] += Number(o.total);
        else if (hour < 16) hourlyData['16:00'] += Number(o.total);
        else if (hour < 20) hourlyData['20:00'] += Number(o.total);
        else hourlyData['24:00'] += Number(o.total);
      }
    });

    const hourlyRevenue = Object.keys(hourlyData).map(h => ({
      label: h,
      value: hourlyData[h]
    }));

    // 2. Thống kê 7 ngày kết thúc bằng chartAnchorDate
    const dailyData: Record<string, number> = {};
    const last7Days: { label: string; key: string }[] = [];
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(chartAnchorDate.getTime());
      d.setDate(chartAnchorDate.getDate() - i);
      const dayName = dayNames[d.getDay()];
      const dayVal = String(d.getDate()).padStart(2, '0');
      const monthVal = String(d.getMonth() + 1).padStart(2, '0');
      
      const label = `${dayName} (${dayVal}/${monthVal})`;
      const key = `${d.getFullYear()}-${monthVal}-${dayVal}`;
      last7Days.push({ label, key });
      dailyData[key] = 0;
    }

    successfulOrders.forEach(o => {
      const date = new Date(o.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (dailyData[key] !== undefined) {
        dailyData[key] += Number(o.total);
      }
    });

    const weeklyRevenue = last7Days.map(d => ({
      label: d.label,
      value: dailyData[d.key]
    }));

    // 3. Thống kê theo 12 tháng của năm targetYear cố định
    const targetYear = chartAnchorDate.getFullYear();
    const monthlyData: Record<string, number> = {};
    const monthsList: { label: string; key: string }[] = [];
    for (let m = 1; m <= 12; m++) {
      const label = `${String(m).padStart(2, '0')}/${targetYear}`;
      const key = `${targetYear}-${String(m).padStart(2, '0')}`;
      monthsList.push({ label, key });
      monthlyData[key] = 0;
    }

    successfulOrders.forEach(o => {
      const date = new Date(o.created_at);
      if (date.getFullYear() === targetYear) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData[key] !== undefined) {
          monthlyData[key] += Number(o.total);
        }
      }
    });

    const monthlyRevenue = monthsList.map(m => ({
      label: m.label,
      value: monthlyData[m.key]
    }));

    // Tính toán dữ liệu biểu đồ con nếu có tháng được chọn
    let subChartData: { label: string; revenue: number; qty: number; cancelled: number }[] = [];
    if (selectedSubChartMonth) {
      const [mStr, yStr] = selectedSubChartMonth.split('/');
      const month = parseInt(mStr);
      const year = parseInt(yStr);
      const daysInMonth = new Date(year, month, 0).getDate(); // Lấy số ngày của tháng đó
      
      const dailySubData: Record<string, { label: string; revenue: number; qty: number; cancelled: number }> = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = String(d).padStart(2, '0');
        const mStr = String(month).padStart(2, '0');
        const key = `${dStr}/${mStr}`;
        const ymdKey = `${year}-${mStr}-${dStr}`;
        dailySubData[ymdKey] = {
          label: key,
          revenue: 0,
          qty: 0,
          cancelled: 0
        };
      }

      // Doanh thu & sản phẩm bán được của đơn thành công
      successfulOrders.forEach(o => {
        const date = new Date(o.created_at);
        if (date.getFullYear() === year && (date.getMonth() + 1) === month) {
          const dStr = String(date.getDate()).padStart(2, '0');
          const mStr = String(month).padStart(2, '0');
          const ymdKey = `${year}-${mStr}-${dStr}`;
          if (dailySubData[ymdKey]) {
            dailySubData[ymdKey].revenue += Number(o.total);
            o.items?.forEach((item: any) => {
              dailySubData[ymdKey].qty += Number(item.quantity || 1);
            });
          }
        }
      });

      // Số đơn bị hủy
      cancelledOrders.forEach(o => {
        const date = new Date(o.created_at);
        if (date.getFullYear() === year && (date.getMonth() + 1) === month) {
          const dStr = String(date.getDate()).padStart(2, '0');
          const mStr = String(month).padStart(2, '0');
          const ymdKey = `${year}-${mStr}-${dStr}`;
          if (dailySubData[ymdKey]) {
            dailySubData[ymdKey].cancelled += 1;
          }
        }
      });

      subChartData = Object.keys(dailySubData).sort().map(k => dailySubData[k]);
    }

    // Lọc đơn hàng theo thời điểm được click chọn trên biểu đồ (nếu có)
    let filteredOrdersForCategory = successfulOrders;

    if (selectedSubChartMonth) {
      const [mStr, yStr] = selectedSubChartMonth.split('/');
      const month = parseInt(mStr);
      const year = parseInt(yStr);

      if (selectedTimePoint) {
        const day = parseInt(selectedTimePoint.split('/')[0]);
        filteredOrdersForCategory = successfulOrders.filter(o => {
          const date = new Date(o.created_at);
          return date.getFullYear() === year && (date.getMonth() + 1) === month && date.getDate() === day;
        });
      } else {
        filteredOrdersForCategory = successfulOrders.filter(o => {
          const date = new Date(o.created_at);
          return date.getFullYear() === year && (date.getMonth() + 1) === month;
        });
      }
    } else if (selectedTimePoint) {
      // Đang xem biểu đồ lớn
      if (chartTab === 'month') {
        const [mStr, yStr] = selectedTimePoint.split('/');
        const month = parseInt(mStr);
        const year = parseInt(yStr);
        filteredOrdersForCategory = successfulOrders.filter(o => {
          const date = new Date(o.created_at);
          return date.getFullYear() === year && (date.getMonth() + 1) === month;
        });
      } else if (chartTab === 'week') {
        const matchedDay = last7Days.find(d => d.label === selectedTimePoint);
        if (matchedDay) {
          filteredOrdersForCategory = successfulOrders.filter(o => {
            const date = new Date(o.created_at);
            const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            return ymd === matchedDay.key;
          });
        }
      } else if (chartTab === 'today') {
        const targetHourMap: Record<string, number[]> = {
          '04:00': [0, 1, 2, 3],
          '08:00': [4, 5, 6, 7],
          '12:00': [8, 9, 10, 11],
          '16:00': [12, 13, 14, 15],
          '20:00': [16, 17, 18, 19],
          '24:00': [20, 21, 22, 23]
        };
        const hours = targetHourMap[selectedTimePoint] || [];
        filteredOrdersForCategory = successfulOrders.filter(o => {
          const date = new Date(o.created_at);
          const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          return ymd === targetYMD && hours.includes(date.getHours());
        });
      }
    } else {
      // Khi không có điểm click cụ thể, mặc định lọc theo chu kỳ lớn của biểu đồ đó
      if (chartTab === 'month') {
        filteredOrdersForCategory = successfulOrders.filter(o => {
          return new Date(o.created_at).getFullYear() === targetYear;
        });
      } else if (chartTab === 'week') {
        const validKeys = last7Days.map(d => d.key);
        filteredOrdersForCategory = successfulOrders.filter(o => {
          const date = new Date(o.created_at);
          const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          return validKeys.includes(ymd);
        });
      } else if (chartTab === 'today') {
        filteredOrdersForCategory = successfulOrders.filter(o => {
          const date = new Date(o.created_at);
          const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          return ymd === targetYMD;
        });
      }
    }

    // 3. Phân bổ doanh số theo danh mục sản phẩm (Tỷ lệ bán được)
    const categorySales: Record<string, { qty: number; revenue: number }> = {
      laptop: { qty: 0, revenue: 0 },
      phone: { qty: 0, revenue: 0 },
      smartwatch: { qty: 0, revenue: 0 },
      earphone: { qty: 0, revenue: 0 },
      accessory: { qty: 0, revenue: 0 },
    };

    let totalQtySold = 0;
    const productSalesMap: Record<string, { name: string; image: string; qty: number; revenue: number }> = {};

    filteredOrdersForCategory.forEach(o => {
      o.items?.forEach((item: any) => {
        const matchedProduct = products.find(p => 
          p.id === item.id || 
          p.id === item.product_id || 
          item.name === p.name ||
          item.name.startsWith(p.name) ||
          item.name.includes(p.name)
        );
        const cat = matchedProduct?.category || 'accessory';
        if (categorySales[cat]) {
          const qty = Number(item.quantity || 1);
          categorySales[cat].qty += qty;
          categorySales[cat].revenue += Number(item.price || 0) * qty;
          totalQtySold += qty;

          // Thống kê chi tiết từng sản phẩm
          const prodKey = item.id || item.name;
          if (!productSalesMap[prodKey]) {
            productSalesMap[prodKey] = {
              name: item.name,
              image: item.image || '',
              qty: 0,
              revenue: 0
            };
          }
          productSalesMap[prodKey].qty += qty;
          productSalesMap[prodKey].revenue += Number(item.price || 0) * qty;
        }
      });
    });

    // Tìm top 1 sản phẩm bán chạy nhất trong tập lọc
    let topProduct: any = null;
    let maxProdQty = 0;
    Object.values(productSalesMap).forEach((pInfo: any) => {
      if (pInfo.qty > maxProdQty) {
        maxProdQty = pInfo.qty;
        topProduct = pInfo;
      }
    });

    // Mảng màu sắc cho từng danh mục
    const CAT_COLORS: Record<string, string> = {
      laptop: 'bg-primary',
      phone: 'bg-indigo-500',
      smartwatch: 'bg-emerald-500',
      earphone: 'bg-amber-500',
      accessory: 'bg-purple-500'
    };

    const categoryRates = CATEGORIES.map(c => {
      const salesInfo = categorySales[c.value] || { qty: 0, revenue: 0 };
      const percentage = totalQtySold > 0 ? Math.round((salesInfo.qty / totalQtySold) * 100) : 0;
      return {
        category: c.value,
        label: c.label,
        qty: salesInfo.qty,
        revenue: salesInfo.revenue,
        percentage,
        colorClass: CAT_COLORS[c.value] || 'bg-muted'
      };
    });

    return {
      revenue: totalRevenue,
      lostRevenue,
      aov,
      cancelledRate,
      orderCount: orders.length,
      productCount: products.length,
      userCount: users.length || 1,
      lowStock: lowStockProducts,
      outOfStockCount,
      weeklyRevenue,
      monthlyRevenue,
      hourlyRevenue,
      categoryRates,
      totalQtySold,
      topProduct,
      subChartData
    };
  };

  const stats = calculateStats();

  // Lọc sản phẩm
  const filteredProducts = products.filter(p => {
    let matchesSearch = true;
    if (prodSearch.trim()) {
      const removeVietnameseTones = (str: string) => {
        return str
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .toLowerCase();
      };
      const qClean = removeVietnameseTones(prodSearch.trim());
      if (qClean) {
        const queryWords = qClean.split(/\s+/).filter(Boolean);
        const nameClean = removeVietnameseTones(p.name || '');
        const brandClean = removeVietnameseTones(p.brand || '');
        const descClean = removeVietnameseTones(p.description || '');
        const productWords = `${nameClean} ${brandClean} ${descClean}`.split(/[\s\-\/\,\.\(\)]+/).filter(Boolean);
        
        matchesSearch = queryWords.every(qw => 
          productWords.some(pw => pw.startsWith(qw))
        );
      }
    }
    const matchesCategory = prodFilterCategory ? p.category === prodFilterCategory : true;
    return matchesSearch && matchesCategory;
  });

  // Lọc đơn hàng
  const filteredOrders = orders.filter(o => {
    return o.id.toLowerCase().includes(orderSearch.toLowerCase()) || o.shipping_address.toLowerCase().includes(orderSearch.toLowerCase());
  });

  // Lọc tickets
  const filteredTickets = tickets.filter(t => {
    return ticketFilterStatus ? t.status === ticketFilterStatus : true;
  });

  // Loading xác thực quyền
  if (isAdmin === null) {
    return (
      <div className="container mx-auto px-4 py-32 text-center flex-1 flex flex-col items-center justify-center gap-3 transition-colors duration-200">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <span className="text-sm text-muted-foreground">Đang xác thực quyền truy cập Admin...</span>
      </div>
    );
  }

  // Chặn truy cập trái phép
  if (isAdmin === false) {
    return (
      <div className="container mx-auto px-4 py-32 text-center flex-1 flex flex-col items-center justify-center gap-4 transition-colors duration-200">
        <div className="p-4 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
          <AlertCircle className="w-12 h-12" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">Truy cập bị từ chối</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {authError || 'Bạn không có quyền quản trị để truy cập trang này.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-[calc(100vh-140px)] bg-background text-foreground transition-colors duration-200">
      
      {/* 1. SIDEBAR ĐIỀU HƯỚNG */}
      <aside className="w-64 border-r border-border bg-card/35 hidden md:flex flex-col p-6 space-y-6 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2 pb-4 border-b border-border">
          <LayoutDashboard className="w-5 h-5 text-primary" />
          <span className="font-extrabold text-base tracking-wide uppercase text-foreground">Admin Panel</span>
        </div>
        
        <nav className="flex-1 space-y-1.5 text-sm">
          <button
            onClick={() => setPanel('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium cursor-pointer ${
              panel === 'dashboard' ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          
          <button
            onClick={() => setPanel('products')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium cursor-pointer ${
              panel === 'products' ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Sản phẩm ({products.length})</span>
          </button>
          
          <button
            onClick={() => setPanel('orders')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium cursor-pointer ${
              panel === 'orders' ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Đơn hàng ({orders.length})</span>
          </button>
          
          <button
            onClick={() => setPanel('users')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium cursor-pointer ${
              panel === 'users' ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Nhân viên & Khách</span>
          </button>
          
          <button
            onClick={() => setPanel('tickets')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium cursor-pointer ${
              panel === 'tickets' ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <LifeBuoy className="w-4 h-4" />
            <span>Hỗ trợ khách hàng ({tickets.filter(t=>t.status!=='resolved').length})</span>
          </button>
        </nav>

        <div className="pt-4 border-t border-border text-center">
          <Link href="/" className="text-xs text-primary hover:underline font-semibold">
            ← Quay lại trang chủ mua sắm
          </Link>
        </div>
      </aside>

      {/* 2. NỘI DUNG CHÍNH (MAIN CONTENT) */}
      <main className="flex-1 p-6 md:p-8 space-y-6 overflow-hidden">
        
        {/* Mobile Navigation bar */}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-3 border-b border-border no-scrollbar text-xs">
          <button onClick={() => setPanel('dashboard')} className={`px-3.5 py-2 rounded-xl whitespace-nowrap ${panel === 'dashboard' ? 'bg-primary text-primary-foreground font-bold' : 'bg-card border border-border text-muted-foreground'}`}>Dashboard</button>
          <button onClick={() => setPanel('products')} className={`px-3.5 py-2 rounded-xl whitespace-nowrap ${panel === 'products' ? 'bg-primary text-primary-foreground font-bold' : 'bg-card border border-border text-muted-foreground'}`}>Sản phẩm</button>
          <button onClick={() => setPanel('orders')} className={`px-3.5 py-2 rounded-xl whitespace-nowrap ${panel === 'orders' ? 'bg-primary text-primary-foreground font-bold' : 'bg-card border border-border text-muted-foreground'}`}>Đơn hàng</button>
          <button onClick={() => setPanel('users')} className={`px-3.5 py-2 rounded-xl whitespace-nowrap ${panel === 'users' ? 'bg-primary text-primary-foreground font-bold' : 'bg-card border border-border text-muted-foreground'}`}>Thành viên</button>
          <button onClick={() => setPanel('tickets')} className={`px-3.5 py-2 rounded-xl whitespace-nowrap ${panel === 'tickets' ? 'bg-primary text-primary-foreground font-bold' : 'bg-card border border-border text-muted-foreground'}`}>Hỗ trợ</button>
        </div>

        {/* ========================================== */}
        {/* PANEL: DASHBOARD (TỔNG QUAN THỐNG KÊ) */}
        {/* ========================================== */}
        {panel === 'dashboard' && (
          <div className="space-y-6">
            <div className="space-y-0.5">
              <h1 className="text-xl sm:text-2xl font-black text-foreground">Tổng quan doanh số</h1>
              <p className="text-xs text-muted-foreground">Theo dõi kết quả bán hàng, phân tích doanh thu theo chu kỳ thời gian và tỷ lệ bán ra</p>
            </div>

            {/* Thẻ KPI Chính */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-border bg-card/45 p-4 flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground block">Doanh thu thực tế</span>
                  <span className="text-base sm:text-lg font-black text-foreground block">{formatPrice(stats.revenue)}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-success/10 text-success">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/45 p-4 flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground block">Đơn đặt hàng</span>
                  <span className="text-base sm:text-lg font-black text-foreground block">{stats.orderCount} đơn</span>
                </div>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/45 p-4 flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground block">Sản phẩm tồn kho</span>
                  <span className="text-base sm:text-lg font-black text-foreground block">{stats.productCount} mẫu</span>
                </div>
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
                  <Package className="w-5 h-5" />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/45 p-4 flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground block">Đã bán ra (Sản phẩm)</span>
                  <span className="text-base sm:text-lg font-black text-foreground block">{stats.totalQtySold} chiếc</span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Thẻ KPI Phụ (Phần chưa nghĩ ra - Insights nâng cao) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-border bg-card/25 p-3.5 flex items-center justify-between shadow-sm">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground block">Giá trị đơn trung bình (AOV)</span>
                  <span className="text-sm font-bold text-foreground block">{formatPrice(stats.aov)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/25 p-3.5 flex items-center justify-between shadow-sm" title="Phí giao hàng hoàn trả phát sinh khi đơn hàng bị hủy">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground block">Phí ship hoàn trả (Đang phát triển)</span>
                  <span className="text-xs font-bold text-muted-foreground/60 block">Đợi cấu hình phí vận chuyển</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/25 p-3.5 flex items-center justify-between shadow-sm">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground block">Tỷ lệ hủy đơn hàng</span>
                  <span className="text-sm font-bold text-rose-500 block">{stats.cancelledRate}%</span>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card/25 p-3.5 flex items-center justify-between shadow-sm">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground block">Người dùng đăng ký</span>
                  <span className="text-sm font-bold text-foreground block">{stats.userCount} thành viên</span>
                </div>
              </div>
            </div>

            {/* Thống kê chi tiết & Biểu đồ phân tích */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Cột trái: Biểu đồ doanh thu tuần/tháng */}
              <div className="lg:col-span-2 rounded-2xl border border-border bg-card/40 p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/60 pb-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-foreground">
                      {selectedSubChartMonth 
                        ? `Chi tiết doanh thu tháng ${selectedSubChartMonth}` 
                        : 'Phân tích doanh thu'
                      }
                    </h3>
                    
                    {/* Hàng điều phối thời gian với nút < và > */}
                    {!selectedSubChartMonth && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => shiftChartDate('prev')}
                          title="Chu kỳ trước"
                          className="p-1 rounded border border-border bg-background hover:bg-muted text-foreground cursor-pointer transition-colors shadow-sm"
                        >
                          <ChevronLeft className="w-3 h-3" />
                        </button>
                        
                        <span className="text-[10px] font-black text-foreground select-none">
                          {(() => {
                            if (chartTab === 'today') {
                              return `Ngày ${String(chartAnchorDate.getDate()).padStart(2, '0')}/${String(chartAnchorDate.getMonth() + 1).padStart(2, '0')}/${chartAnchorDate.getFullYear()}`;
                            } else if (chartTab === 'week') {
                              // Tính ngày đầu và cuối tuần
                              const start = new Date(chartAnchorDate.getTime() - 6 * 24 * 60 * 60 * 1000);
                              const startStr = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`;
                              const endStr = `${String(chartAnchorDate.getDate()).padStart(2, '0')}/${String(chartAnchorDate.getMonth() + 1).padStart(2, '0')}`;
                              return `Tuần: ${startStr} - ${endStr}`;
                            } else {
                              return `Năm ${chartAnchorDate.getFullYear()}`;
                            }
                          })()}
                        </span>

                        <button
                          onClick={() => shiftChartDate('next')}
                          title="Chu kỳ sau"
                          className="p-1 rounded border border-border bg-background hover:bg-muted text-foreground cursor-pointer transition-colors shadow-sm"
                        >
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {selectedSubChartMonth ? (
                    <button
                      onClick={() => {
                        setSelectedSubChartMonth(null);
                        setSelectedTimePoint(null);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-lg border border-border bg-background hover:bg-muted font-bold text-foreground cursor-pointer transition-colors shadow-sm"
                    >
                      ← Quay lại 12 tháng
                    </button>
                  ) : (
                    <div className="flex rounded-lg border border-border bg-background p-0.5 text-xs">
                      <button
                        onClick={() => handleChartTabChange('today')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                          chartTab === 'today' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        1 ngày (Hôm nay)
                      </button>
                      <button
                        onClick={() => handleChartTabChange('week')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                          chartTab === 'week' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        7 ngày trước
                      </button>
                      <button
                        onClick={() => handleChartTabChange('month')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                          chartTab === 'month' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        1 năm trước (12 tháng)
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Vẽ Biểu đồ Đường SVG chuyên nghiệp với lưới phân tích (Grid Lines) */}
                {(() => {
                  if (selectedSubChartMonth) {
                    const activeData = stats.subChartData || [];
                    const maxRevenue = Math.max(...activeData.map((d: any) => d.revenue), 1000000);
                    const maxQty = Math.max(...activeData.map((d: any) => d.qty), 1);
                    const maxCancelled = Math.max(...activeData.map((d: any) => d.cancelled), 1);
                    const maxRightAxis = Math.max(maxQty, maxCancelled, 5); // Trục Y phụ bên phải
                    
                    const svgWidth = 600;
                    const svgHeight = 220;
                    const paddingLeft = 70;
                    const paddingRight = 45;
                    const paddingTop = 25;
                    const paddingBottom = 30;
                    
                    const chartWidth = svgWidth - paddingLeft - paddingRight;
                    const chartHeight = svgHeight - paddingTop - paddingBottom;
                    
                    // Điểm tọa độ Doanh thu
                    const pointsRevenue = activeData.map((item: any, idx: number) => {
                      const x = paddingLeft + (idx * (chartWidth / (activeData.length - 1)));
                      const y = svgHeight - paddingBottom - (item.revenue / maxRevenue) * chartHeight;
                      return { x, y, label: item.label, value: item.revenue, qty: item.qty, cancelled: item.cancelled };
                    });
                    
                    // Điểm tọa độ Số lượng bán được (qty)
                    const pointsQty = activeData.map((item: any, idx: number) => {
                      const x = paddingLeft + (idx * (chartWidth / (activeData.length - 1)));
                      const y = svgHeight - paddingBottom - (item.qty / maxRightAxis) * chartHeight;
                      return { x, y };
                    });
                    
                    // Điểm tọa độ Đơn bị hủy (cancelled)
                    const pointsCancelled = activeData.map((item: any, idx: number) => {
                      const x = paddingLeft + (idx * (chartWidth / (activeData.length - 1)));
                      const y = svgHeight - paddingBottom - (item.cancelled / maxRightAxis) * chartHeight;
                      return { x, y };
                    });
                    
                    const lineRevenuePath = pointsRevenue.reduce((acc: string, p: any, idx: number) => {
                      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                    }, '');
                    
                    const areaRevenuePath = pointsRevenue.length > 0 
                      ? `${lineRevenuePath} L ${pointsRevenue[pointsRevenue.length - 1].x} ${svgHeight - paddingBottom} L ${pointsRevenue[0].x} ${svgHeight - paddingBottom} Z`
                      : '';
                      
                    const lineQtyPath = pointsQty.reduce((acc: string, p: any, idx: number) => {
                      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                    }, '');

                    const lineCancelledPath = pointsCancelled.reduce((acc: string, p: any, idx: number) => {
                      return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                    }, '');

                    const gridTicks = [0, 0.25, 0.5, 0.75, 1];
                    
                    return (
                      <div className="relative w-full overflow-hidden bg-background/25 rounded-2xl p-2 space-y-2">
                        {/* Legend chú thích màu sắc ở góc */}
                        <div className="flex justify-end gap-4 text-[9px] font-extrabold text-muted-foreground px-2">
                          <div className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
                            <span>Doanh thu (L)</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                            <span>Đã bán (R)</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                            <span>Hủy đơn (R)</span>
                          </div>
                        </div>

                        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible">
                          <defs>
                            <linearGradient id="subChartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
                              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          
                          {/* Lưới ngang & Nhãn trục Y */}
                          {gridTicks.map((tick: number, i: number) => {
                            const y = svgHeight - paddingBottom - tick * chartHeight;
                            const leftVal = Math.round(tick * maxRevenue);
                            const rightVal = Math.round(tick * maxRightAxis);
                            return (
                              <g key={i} className="opacity-40">
                                <line 
                                  x1={paddingLeft} 
                                  y1={y} 
                                  x2={svgWidth - paddingRight} 
                                  y2={y} 
                                  stroke="currentColor" 
                                  strokeWidth="1" 
                                  strokeDasharray="3 3" 
                                  className="text-border/80"
                                />
                                {/* Trục Y trái: Doanh thu */}
                                <text 
                                  x={paddingLeft - 10} 
                                  y={y + 3.5} 
                                  textAnchor="end" 
                                  className="fill-muted-foreground text-[8px] font-bold"
                                >
                                  {tick === 0 ? '0' : formatPrice(leftVal)}
                                </text>
                                {/* Trục Y phải: Số lượng */}
                                <text 
                                  x={svgWidth - paddingRight + 10} 
                                  y={y + 3.5} 
                                  textAnchor="start" 
                                  className="fill-muted-foreground text-[8px] font-bold"
                                >
                                  {rightVal}
                                </text>
                              </g>
                            );
                          })}
                          
                          {/* Đổ vùng màu gradient doanh thu */}
                          {areaRevenuePath && (
                            <path d={areaRevenuePath} fill="url(#subChartAreaGrad)" />
                          )}
                          
                          {/* Đường Line Doanh thu */}
                          {lineRevenuePath && (
                            <path 
                              d={lineRevenuePath} 
                              fill="none" 
                              stroke="var(--primary)" 
                              strokeWidth="2.5" 
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}

                          {/* Đường Line Số lượng đã bán */}
                          {lineQtyPath && (
                            <path 
                              d={lineQtyPath} 
                              fill="none" 
                              stroke="#f59e0b" 
                              strokeWidth="1.5" 
                              strokeDasharray="4 2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}

                          {/* Đường Line Đơn bị hủy */}
                          {lineCancelledPath && (
                            <path 
                              d={lineCancelledPath} 
                              fill="none" 
                              stroke="#f53f3f" 
                              strokeWidth="1.5" 
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                          
                          {/* Điểm tương tác của từng ngày */}
                          {pointsRevenue.map((p: any, idx: number) => {
                            const isTodayFiltered = selectedTimePoint === p.label;
                            const showLabel = idx === 0 || idx === 4 || idx === 9 || idx === 14 || idx === 19 || idx === 24 || idx === activeData.length - 1;
                            
                            return (
                              <g key={idx} className="group/subpoint">
                                {showLabel && (
                                  <text 
                                    x={p.x} 
                                    y={svgHeight - 6} 
                                    textAnchor="middle" 
                                    onClick={() => setSelectedTimePoint(selectedTimePoint === p.label ? null : p.label)}
                                    className={`cursor-pointer text-[8px] font-extrabold transition-all duration-150 ${
                                      isTodayFiltered 
                                        ? 'fill-primary font-black scale-110' 
                                        : 'fill-muted-foreground hover:fill-foreground'
                                    }`}
                                  >
                                    {p.label}
                                  </text>
                                )}
                                
                                {/* Điểm chấm Doanh thu */}
                                <circle 
                                  cx={p.x} 
                                  cy={p.y} 
                                  r={isTodayFiltered ? "5" : "3"} 
                                  onClick={() => setSelectedTimePoint(selectedTimePoint === p.label ? null : p.label)}
                                  className={`cursor-pointer transition-all duration-150 ${
                                    isTodayFiltered 
                                      ? 'fill-primary stroke-background stroke-[2px]' 
                                      : 'fill-background stroke-primary stroke-[1.5px] group-hover/subpoint:r-5'
                                  }`}
                                />

                                {/* Điểm chấm Số lượng bán */}
                                <circle 
                                  cx={p.x} 
                                  cy={pointsQty[idx].y} 
                                  r="2" 
                                  className="fill-background stroke-amber-500 stroke-[1px] opacity-60 group-hover/subpoint:opacity-100 pointer-events-none"
                                />
                                
                                {/* Vùng nhạy cảm click & hover */}
                                <circle 
                                  cx={p.x} 
                                  cy={p.y} 
                                  r="16" 
                                  onClick={() => setSelectedTimePoint(selectedTimePoint === p.label ? null : p.label)}
                                  className="fill-transparent cursor-pointer"
                                />
                                
                                {/* Tooltip chi tiết của ngày */}
                                <g className="opacity-0 group-hover/subpoint:opacity-100 pointer-events-none transition-opacity duration-150">
                                  <rect 
                                    x={p.x - 60} 
                                    y={Math.min(p.y, pointsQty[idx].y, pointsCancelled[idx].y) - 60} 
                                    width={120} 
                                    height={52} 
                                    rx={6} 
                                    className="fill-foreground dark:fill-background stroke-border stroke shadow-xl"
                                  />
                                  <text 
                                    x={p.x} 
                                    y={Math.min(p.y, pointsQty[idx].y, pointsCancelled[idx].y) - 48} 
                                    textAnchor="middle" 
                                    className="fill-background dark:fill-foreground text-[8px] font-black"
                                  >
                                    Ngày {p.label}
                                  </text>
                                  <text 
                                    x={p.x - 52} 
                                    y={Math.min(p.y, pointsQty[idx].y, pointsCancelled[idx].y) - 37} 
                                    textAnchor="start" 
                                    className="fill-background dark:fill-foreground text-[8px]"
                                  >
                                    💰 Doanh thu: {formatPrice(p.value)}
                                  </text>
                                  <text 
                                    x={p.x - 52} 
                                    y={Math.min(p.y, pointsQty[idx].y, pointsCancelled[idx].y) - 27} 
                                    textAnchor="start" 
                                    className="fill-background dark:fill-foreground text-[8px]"
                                  >
                                    🛍️ Đã bán: {p.qty} chiếc
                                  </text>
                                  <text 
                                    x={p.x - 52} 
                                    y={Math.min(p.y, pointsQty[idx].y, pointsCancelled[idx].y) - 17} 
                                    textAnchor="start" 
                                    className="fill-rose-400 dark:fill-rose-500 text-[8px] font-semibold"
                                  >
                                    ❌ Đơn hủy: {p.cancelled} đơn
                                  </text>
                                </g>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    );
                  }

                  const activeData = 
                    chartTab === 'month' 
                      ? stats.monthlyRevenue 
                      : chartTab === 'week' 
                        ? stats.weeklyRevenue 
                        : stats.hourlyRevenue || [];
                  const maxVal = Math.max(...activeData.map((d: any) => d.value), 1000000);
                  
                  // Thiết lập thông số tọa độ biểu đồ
                  const svgWidth = 600;
                  const svgHeight = 220;
                  const paddingLeft = 75;
                  const paddingRight = 30;
                  const paddingTop = 20;
                  const paddingBottom = 30;
                  
                  const chartWidth = svgWidth - paddingLeft - paddingRight;
                  const chartHeight = svgHeight - paddingTop - paddingBottom;
                  
                  const points = activeData.map((item: any, idx: number) => {
                    const x = paddingLeft + (idx * (chartWidth / (activeData.length - 1)));
                    const y = svgHeight - paddingBottom - (item.value / maxVal) * chartHeight;
                    return { x, y, label: item.label, value: item.value };
                  });
                  
                  // Tạo chuỗi đường dẫn d cho thẻ path (đường line)
                  const linePath = points.reduce((acc: string, p: any, idx: number) => {
                    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
                  }, '');
                  
                  // Tạo chuỗi đường dẫn khép kín để đổ màu gradient (Area chart)
                  const areaPath = points.length > 0 
                    ? `${linePath} L ${points[points.length - 1].x} ${svgHeight - paddingBottom} L ${points[0].x} ${svgHeight - paddingBottom} Z`
                    : '';

                  // Các mốc lưới ngang (Grid lines) Y: 0%, 25%, 50%, 75%, 100%
                  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
                  
                  return (
                    <div className="relative w-full overflow-hidden bg-background/25 rounded-2xl p-2">
                      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible">
                        {/* Định nghĩa Gradient cho vùng đổ bóng dưới đường */}
                        <defs>
                          <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        
                        {/* 1. Vẽ các đường lưới ngang (Grid Lines) & Nhãn trục Y */}
                        {gridTicks.map((tick: number, i: number) => {
                          const y = svgHeight - paddingBottom - tick * chartHeight;
                          const val = Math.round(tick * maxVal);
                          return (
                            <g key={i} className="opacity-40">
                              {/* Đường lưới đứt nét */}
                              <line 
                                x1={paddingLeft} 
                                y1={y} 
                                x2={svgWidth - paddingRight} 
                                y2={y} 
                                stroke="currentColor" 
                                strokeWidth="1" 
                                strokeDasharray="3 3" 
                                className="text-border/80"
                              />
                              {/* Nhãn trục Y */}
                              <text 
                                x={paddingLeft - 10} 
                                y={y + 3.5} 
                                textAnchor="end" 
                                className="fill-muted-foreground text-[9px] font-bold"
                              >
                                {tick === 0 ? '0' : formatPrice(val)}
                              </text>
                            </g>
                          );
                        })}
                        
                        {/* 2. Đổ vùng màu Gradient phía dưới đường dẫn (Area fill) */}
                        {areaPath && (
                          <path d={areaPath} fill="url(#chartAreaGrad)" />
                        )}
                        
                        {/* 3. Vẽ đường Line chính */}
                        {linePath && (
                          <path 
                            d={linePath} 
                            fill="none" 
                            stroke="var(--primary)" 
                            strokeWidth="3" 
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="drop-shadow-[0_2px_4px_rgba(var(--primary-rgb),0.15)]"
                          />
                        )}
                        
                        {/* 4. Vẽ các chấm tròn toạ độ tương tác + Nhãn trục X */}
                        {points.map((p: any, idx: number) => (
                          <g key={idx} className="group/point">
                            {/* Nhãn trục X bên dưới biểu đồ */}
                            <text 
                              x={p.x} 
                              y={svgHeight - 6} 
                              textAnchor="middle" 
                              onClick={() => {
                                if (chartTab === 'month') {
                                  setSelectedSubChartMonth(p.label);
                                  setSelectedTimePoint(null);
                                } else {
                                  setSelectedTimePoint(selectedTimePoint === p.label ? null : p.label);
                                }
                              }}
                              className={`cursor-pointer text-[10px] font-extrabold transition-all duration-150 ${
                                selectedTimePoint === p.label 
                                  ? 'fill-primary scale-110 font-black' 
                                  : 'fill-muted-foreground hover:fill-foreground'
                              }`}
                            >
                              {p.label}
                            </text>
                            
                            {/* Chấm tròn chính */}
                            <circle 
                              cx={p.x} 
                              cy={p.y} 
                              r={selectedTimePoint === p.label ? "6.5" : "4.5"} 
                              onClick={() => {
                                if (chartTab === 'month') {
                                  setSelectedSubChartMonth(p.label);
                                  setSelectedTimePoint(null);
                                } else {
                                  setSelectedTimePoint(selectedTimePoint === p.label ? null : p.label);
                                }
                              }}
                              className={`cursor-pointer transition-all duration-150 ${
                                selectedTimePoint === p.label 
                                  ? 'fill-primary stroke-background stroke-[3px]' 
                                  : 'fill-background stroke-primary stroke-[2.5px] group-hover/point:r-6 group-hover/point:stroke-[3.5px]'
                              }`}
                            />
                            
                            {/* Tooltip vùng nhạy cảm lớn hơn để dễ hover */}
                            <circle 
                              cx={p.x} 
                              cy={p.y} 
                              r="16" 
                              onClick={() => {
                                if (chartTab === 'month') {
                                  setSelectedSubChartMonth(p.label);
                                  setSelectedTimePoint(null);
                                } else {
                                  setSelectedTimePoint(selectedTimePoint === p.label ? null : p.label);
                                }
                              }}
                              className="fill-transparent cursor-pointer"
                            />
                            
                            {/* Tooltip hiển thị số tiền khi hover */}
                            <g className="opacity-0 group-hover/point:opacity-100 pointer-events-none transition-opacity duration-150">
                              <rect 
                                x={p.x - 55} 
                                y={p.y - 30} 
                                width="110" 
                                height="20" 
                                rx="5" 
                                className="fill-foreground dark:fill-background stroke-border stroke shadow-lg"
                              />
                              <text 
                                x={p.x} 
                                y={p.y - 17} 
                                textAnchor="middle" 
                                className="fill-background dark:fill-foreground text-[9px] font-extrabold"
                              >
                                {formatPrice(p.value)}
                              </text>
                            </g>
                          </g>
                        ))}
                      </svg>
                    </div>
                  );
                })()}
                
                <div className="text-[10px] text-muted-foreground text-center italic flex items-center justify-center gap-1.5 pt-1">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  <span>Dữ liệu doanh thu thực tế được tổng hợp từ các đơn hàng đã đặt (không tính đơn bị hủy)</span>
                </div>
              </div>

              {/* Cột phải: Tỷ lệ bán được theo danh mục (Sales rates) */}
              <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-4 shadow-sm flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="border-b border-border pb-2.5 flex justify-between items-center">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Tỷ lệ bán được theo loại</h3>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedTimePoint 
                          ? `Lọc ngày: ${selectedTimePoint}` 
                          : selectedSubChartMonth 
                            ? `Lọc tháng: ${selectedSubChartMonth}` 
                            : 'Thống kê tổng hợp toàn thời gian'
                        }
                      </p>
                    </div>
                    {(selectedTimePoint || selectedSubChartMonth) && (
                      <button 
                        onClick={() => {
                          setSelectedTimePoint(null);
                          setSelectedSubChartMonth(null);
                        }}
                        className="text-[9px] px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground font-extrabold cursor-pointer transition-colors border border-border"
                      >
                        Đặt lại
                      </button>
                    )}
                  </div>

                  <div className="space-y-4 pr-1">
                    {stats.categoryRates.map((item, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-foreground capitalize">{item.label}</span>
                          <span className="text-muted-foreground">{item.qty} chiếc ({item.percentage}%)</span>
                        </div>
                        {/* Thanh Progress bar */}
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ease-out ${item.colorClass}`}
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-muted-foreground/80">
                          <span>Doanh thu:</span>
                          <span className="font-bold text-foreground">{formatPrice(item.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Top sản phẩm bán chạy trong khoảng thời gian được lọc */}
                  {stats.topProduct && (
                    <div className="pt-3.5 border-t border-border/50 space-y-2 mt-2">
                      <h4 className="text-[10px] font-extrabold text-primary uppercase tracking-wider">
                        🔥 Bán chạy nhất {selectedTimePoint ? `(${selectedTimePoint})` : selectedSubChartMonth ? `(${selectedSubChartMonth})` : ''}
                      </h4>
                      <div className="flex gap-2.5 bg-muted/20 p-2.5 rounded-xl border border-border/40">
                        {stats.topProduct.image && (
                          <div className="w-10 h-10 rounded-lg bg-background border border-border p-0.5 flex-shrink-0 flex items-center justify-center">
                            <img src={stats.topProduct.image} alt={stats.topProduct.name} className="w-full h-full object-contain" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="text-xs font-extrabold text-foreground truncate" title={stats.topProduct.name}>
                            {stats.topProduct.name}
                          </p>
                          <div className="flex justify-between text-[9px] text-muted-foreground">
                            <span>Đã bán: <strong className="text-foreground font-bold">{stats.topProduct.qty} chiếc</strong></span>
                            <span>Doanh thu: <strong className="text-foreground font-bold">{formatPrice(stats.topProduct.revenue)}</strong></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-muted/40 p-2.5 rounded-xl border border-border text-[9px] text-muted-foreground mt-4 leading-relaxed">
                  {selectedTimePoint ? (
                    <span>Doanh số được lọc theo ngày cụ thể <strong>{selectedTimePoint}</strong>. Nhấp Đặt lại để xem toàn bộ dữ liệu.</span>
                  ) : selectedSubChartMonth ? (
                    <span>Doanh số được lọc theo tháng <strong>{selectedSubChartMonth}</strong>. Nhấp vào các ngày trên biểu đồ con hoặc Đặt lại để xem toàn bộ.</span>
                  ) : (
                    <span>Thiết bị **Điện thoại** và **Laptop** đang là các mặt hàng dẫn đầu về số lượng bán ra và tổng giá trị đơn hàng trong hệ thống.</span>
                  )}
                </div>
              </div>

            </div>

            {/* Khối Tồn kho thấp & Đơn hàng mới nhất ở chân Dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Đơn hàng mới nhất */}
              <div className="lg:col-span-2 rounded-2xl border border-border bg-card/40 p-5 space-y-3.5 shadow-sm">
                <div className="border-b border-border pb-2 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-foreground">Đơn đặt hàng mới nhận</h3>
                  <button onClick={() => setPanel('orders')} className="text-xs text-primary hover:underline font-bold">Xem tất cả</button>
                </div>
                
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {orders.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">Chưa có đơn hàng nào trong hệ thống.</p>
                  ) : (
                    orders.slice(0, 3).map(o => (
                      <div key={o.id} className="flex justify-between items-center text-xs border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0">
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">Đơn #{o.id.substring(0, 8)}...</p>
                          <span className="text-[10px] text-muted-foreground block">{formatDate(o.created_at)}</span>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="font-bold block">{formatPrice(o.total)}</span>
                          {getOrderStatusBadge(o.status)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Cảnh báo tồn kho */}
              <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-3.5 shadow-sm flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center border-b border-border pb-2">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive" />
                      <span>Cảnh báo tồn kho</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-bold">Tồn &lt; 5 chiếc</span>
                  </div>

                  <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
                    {stats.lowStock.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-6 text-center">Tồn kho của tất cả sản phẩm đều ở mức an toàn.</p>
                    ) : (
                      stats.lowStock.map(p => (
                        <div key={p.id} className="flex justify-between items-center text-xs border-b border-border/40 pb-2">
                          <span className="font-medium text-foreground line-clamp-1 flex-1 pr-3">{p.name}</span>
                          <span className={`font-bold px-2 py-0.5 rounded border ${p.stock === 0 ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                            {p.stock === 0 ? 'Hết hàng' : `Còn ${p.stock}`}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-muted/40 p-3 rounded-xl border border-border text-[10px] text-muted-foreground mt-3">
                  Tổng cộng có <strong className="text-foreground">{stats.outOfStockCount}</strong> sản phẩm hiện đang hết sạch hàng trong kho.
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* PANEL: SẢN PHẨM (PRODUCTS) */}
        {/* ========================================== */}
        {panel === 'products' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
              <div className="space-y-0.5">
                <h1 className="text-xl sm:text-2xl font-black text-foreground">Danh sách sản phẩm ({products.length})</h1>
                <p className="text-xs text-muted-foreground">Thêm mới, sửa đổi thông tin kỹ thuật (Specs) và quản lý số lượng tồn kho</p>
              </div>
              <button
                onClick={openCreateProduct}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-bold shadow-md shadow-primary/15 active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm sản phẩm</span>
              </button>
            </div>

            {/* Tìm kiếm & Bộ lọc + Bảng + Phân trang bọc trong layout Split View */}
            {(() => {
              const ADMIN_ITEMS_PER_PAGE = 20;
              const totalProdPages = Math.ceil(filteredProducts.length / ADMIN_ITEMS_PER_PAGE);
              const startIdx = (prodCurrentPage - 1) * ADMIN_ITEMS_PER_PAGE;
              const currentAdminProducts = filteredProducts.slice(startIdx, startIdx + ADMIN_ITEMS_PER_PAGE);
              
              const getAdminPageNumbers = () => {
                const pages: (number | string)[] = [];
                const maxVisible = 5;
                if (totalProdPages <= maxVisible) {
                  for (let i = 1; i <= totalProdPages; i++) pages.push(i);
                } else {
                  if (prodCurrentPage <= 3) {
                    pages.push(1, 2, 3, 4, '...', totalProdPages);
                  } else if (prodCurrentPage >= totalProdPages - 2) {
                    pages.push(1, '...', totalProdPages - 3, totalProdPages - 2, totalProdPages - 1, totalProdPages);
                  } else {
                    pages.push(1, '...', prodCurrentPage - 1, prodCurrentPage, prodCurrentPage + 1, '...', totalProdPages);
                  }
                }
                return pages;
              };

              return (
                <div className="flex flex-col lg:flex-row gap-6 items-start relative w-full">
                  {/* CỘT TRÁI: DANH SÁCH SẢN PHẨM */}
                  <div className={`space-y-4 transition-all duration-300 ${modalOpen ? 'flex-1 min-w-0' : 'w-full'}`}>
                    {/* Tìm kiếm & Bộ lọc */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1 max-w-sm">
                        <input
                          type="text"
                          placeholder="Tìm tên hoặc thương hiệu..."
                          value={prodSearch}
                          onChange={(e) => setProdSearch(e.target.value)}
                          className="w-full h-10 pl-10 pr-4 rounded-xl border border-border bg-background text-foreground placeholder-muted-foreground/60 text-sm focus:outline-none focus:border-primary"
                        />
                        <Search className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                      </div>
                      
                      <div className="relative" ref={catDropdownRef}>
                        <button
                          type="button"
                          onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                          className={`h-10 px-4 rounded-xl border text-sm flex items-center justify-between gap-1.5 cursor-pointer transition-all ${
                            isCatDropdownOpen || prodFilterCategory
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground/35'
                          }`}
                        >
                          <span>{prodFilterCategory ? (CATEGORIES.find(c => c.value === prodFilterCategory)?.label || prodFilterCategory) : '-- Tất cả danh mục --'}</span>
                          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isCatDropdownOpen && (
                          <div className="absolute top-[calc(100%+4px)] left-0 w-56 bg-card border border-border rounded-xl shadow-2xl p-1.5 z-40 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="max-h-48 overflow-y-auto pr-1 custom-scroll space-y-0.5">
                              <div
                                onClick={() => {
                                  setProdFilterCategory('');
                                  setIsCatDropdownOpen(false);
                                }}
                                className={`px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                                  !prodFilterCategory ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                -- Tất cả danh mục --
                              </div>
                              {CATEGORIES.map((c) => (
                                <div
                                  key={c.value}
                                  onClick={() => {
                                    setProdFilterCategory(c.value);
                                    setIsCatDropdownOpen(false);
                                  }}
                                  className={`px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                                    prodFilterCategory === c.value ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                                  }`}
                                >
                                  {c.label}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bảng sản phẩm */}
                    <div className="rounded-2xl border border-border overflow-hidden overflow-x-auto">
                      <table className="w-full text-sm min-w-[500px]">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                          <tr>
                            <th className="text-left font-semibold px-4 py-3">Sản phẩm</th>
                            {!modalOpen && <th className="text-left font-semibold px-4 py-3">Danh mục</th>}
                            <th className="text-right font-semibold px-4 py-3">Giá</th>
                            {!modalOpen && <th className="text-right font-semibold px-4 py-3">Tồn kho</th>}
                            <th className="text-right font-semibold px-4 py-3">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {currentAdminProducts.map((p) => (
                            <tr key={p.id} className={`hover:bg-muted/30 transition-colors ${editingProduct?.id === p.id && modalOpen ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-background border border-border p-1 flex items-center justify-center flex-shrink-0">
                                    <img src={p.images?.[0]} alt={p.name} className="w-full h-full object-contain" />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-foreground line-clamp-1">{p.name}</p>
                                    <p className="text-xs text-muted-foreground">{p.brand}</p>
                                  </div>
                                </div>
                              </td>
                              {!modalOpen && (
                                <td className="px-4 py-3">
                                  <span className="inline-block px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-secondary text-muted-foreground border border-border rounded-lg">
                                    {p.category}
                                  </span>
                                </td>
                              )}
                              <td className="px-4 py-3 text-right font-bold text-foreground">
                                {formatPrice(p.price)}
                              </td>
                              {!modalOpen && (
                                <td className="px-4 py-3 text-right">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-bold ${
                                    p.stock > 10
                                      ? 'bg-success/10 text-success'
                                      : p.stock > 0
                                      ? 'bg-amber-500/10 text-amber-500'
                                      : 'bg-destructive/10 text-destructive'
                                  }`}>
                                    <span>{p.stock}</span>
                                    <span className="text-[10px] font-normal text-muted-foreground">sp</span>
                                  </span>
                                </td>
                              )}
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => openEditProduct(p)} className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer" title="Sửa">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDeleteProduct(p)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer" title="Xóa">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {filteredProducts.length === 0 && (
                            <tr>
                              <td colSpan={modalOpen ? 3 : 5} className="px-4 py-10 text-center text-muted-foreground text-sm">Không có sản phẩm nào.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* PHÂN TRANG ADMIN PRODUCTS */}
                    {totalProdPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-border/40 select-none">
                        <button
                          type="button"
                          onClick={() => setProdCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={prodCurrentPage === 1}
                          className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:bg-card disabled:hover:text-muted-foreground transition-all cursor-pointer"
                          title="Trang trước"
                        >
                          <ChevronLeft className="w-4.5 h-4.5" />
                        </button>
                        
                        <div className="flex items-center gap-1">
                          {getAdminPageNumbers().map((page, index) => {
                            if (page === '...') {
                              return (
                                <span key={`admin-dots-${index}`} className="w-9 h-9 flex items-center justify-center text-muted-foreground font-bold select-none text-xs">
                                  ...
                                </span>
                              );
                            }
                            return (
                              <button
                                key={`admin-page-${page}`}
                                type="button"
                                onClick={() => setProdCurrentPage(Number(page))}
                                className={`w-9 h-9 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                                  prodCurrentPage === page
                                    ? 'bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20 scale-105'
                                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                              >
                                {page}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => setProdCurrentPage(prev => Math.min(prev + 1, totalProdPages))}
                          disabled={prodCurrentPage === totalProdPages}
                          className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:bg-card disabled:hover:text-muted-foreground transition-all cursor-pointer"
                          title="Trang sau"
                        >
                          <ChevronRight className="w-4.5 h-4.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* CỘT PHẢI: FORM CHỈNH SỬA / THÊM MỚI SẢN PHẨM (STICKY SIDEBAR) */}
                  {modalOpen && (
                    <div className="w-full lg:w-[480px] xl:w-[500px] bg-card border border-border rounded-2xl shadow-2xl p-5 sticky top-6 max-h-[calc(100vh-160px)] overflow-y-auto custom-scroll animate-in slide-in-from-right duration-300 flex-shrink-0">
                      <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                        <h2 className="text-sm font-bold text-foreground">{editingProduct ? 'Sửa thông tin sản phẩm' : 'Thêm sản phẩm mới'}</h2>
                        <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground">Tên sản phẩm</label>
                          <input
                            required
                            value={formProduct.name}
                            onChange={(e) => setFormProduct({ ...formProduct, name: e.target.value })}
                            placeholder="Ví dụ: iPhone 15 Pro Max 256GB"
                            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-muted-foreground">Thương hiệu</label>
                            <input
                              required
                              value={formProduct.brand}
                              onChange={(e) => setFormProduct({ ...formProduct, brand: e.target.value })}
                              placeholder="Ví dụ: Apple"
                              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-muted-foreground">Danh mục</label>
                            <div className="relative" ref={formCatRef}>
                              <button
                                type="button"
                                onClick={() => setIsFormCatOpen(!isFormCatOpen)}
                                className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer transition-colors flex items-center justify-between"
                              >
                                <span>{CATEGORIES.find(c => c.value === formProduct.category)?.label || 'Chọn danh mục'}</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isFormCatOpen ? 'rotate-180' : ''}`} />
                              </button>

                              {isFormCatOpen && (
                                <div className="absolute left-0 right-0 mt-1 z-30 bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                                  <div className="max-h-48 overflow-y-auto custom-scroll p-1 space-y-0.5">
                                    {CATEGORIES.map((c) => (
                                      <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => {
                                          setFormProduct({ ...formProduct, category: c.value });
                                          setIsFormCatOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                                          formProduct.category === c.value
                                            ? 'bg-primary/10 text-primary'
                                            : 'hover:bg-muted text-foreground'
                                        }`}
                                      >
                                        {c.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-muted-foreground">Giá niêm yết (VNĐ)</label>
                            <input
                              type="number"
                              required
                              value={formProduct.price}
                              onChange={(e) => setFormProduct({ ...formProduct, price: Number(e.target.value) })}
                              placeholder="Giá VNĐ..."
                              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-muted-foreground">Tồn kho</label>
                            <input
                              type="number"
                              required
                              value={formProduct.stock}
                              onChange={(e) => setFormProduct({ ...formProduct, stock: Number(e.target.value) })}
                              placeholder="Số lượng..."
                              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                            />
                          </div>
                        </div>

                        {/* GIẢM GIÁ (DISCOUNT) */}
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
                          <div className="flex items-center gap-2 justify-between">
                            <label className="text-[11px] font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                              🏷️ Giảm giá sản phẩm
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={discountEnabled}
                                onChange={(e) => {
                                  setDiscountEnabled(e.target.checked);
                                  if (e.target.checked) {
                                    if ((formProduct.discount || 0) === 0) {
                                      setFormProduct(prev => ({ ...prev, discount: 10 }));
                                      setDiscountInputStr('10');
                                    } else {
                                      setDiscountInputStr(String(formProduct.discount));
                                    }
                                  } else {
                                    setDiscountInputStr('');
                                  }
                                }}
                                className="w-3 h-3 rounded accent-amber-500 cursor-pointer"
                              />
                              Bật giảm giá
                            </label>
                          </div>
                          {discountEnabled && (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-foreground">% Giảm (0–100)</label>
                                <input
                                  type="text"
                                  value={discountInputStr}
                                  onChange={(e) => {
                                    const valStr = e.target.value;
                                    const normalized = valStr.replace(',', '.');
                                    if (normalized === '' || /^[0-9]*\.?[0-9]*$/.test(normalized)) {
                                      setDiscountInputStr(normalized);
                                      if (normalized === '' || normalized === '.') {
                                        setFormProduct(prev => ({ ...prev, discount: 0 }));
                                      } else {
                                        const num = parseFloat(normalized);
                                        if (!isNaN(num)) {
                                          const clamped = Math.min(100, Math.max(0, num));
                                          setFormProduct(prev => ({ ...prev, discount: clamped }));
                                        }
                                      }
                                    }
                                  }}
                                  placeholder="Ví dụ: 5.7"
                                  className="w-full h-9 px-2.5 rounded-lg border border-amber-500/40 bg-background text-foreground text-xs focus:outline-none focus:border-amber-500 transition-colors"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-foreground">Giá sau giảm (tự tính)</label>
                                <input
                                  type="text"
                                  readOnly
                                  value={discountEnabled && (formProduct.discount || 0) > 0 && formProduct.price > 0
                                    ? Math.round(formProduct.price * (1 - (formProduct.discount || 0) / 100)).toLocaleString('vi-VN') + ' đ'
                                    : '—'}
                                  className="w-full h-9 px-2.5 rounded-lg border border-border bg-muted text-muted-foreground text-xs cursor-not-allowed"
                                />
                              </div>
                            </div>
                          )}
                          {discountEnabled && (formProduct.discount || 0) > 0 && formProduct.price > 0 && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                              → Giá sau giảm: {Math.round(formProduct.price * (1 - (formProduct.discount || 0) / 100)).toLocaleString('vi-VN')}đ
                              &nbsp;← Gốc niêm yết: {formProduct.price.toLocaleString('vi-VN')}đ
                              &nbsp;(-{formProduct.discount}%)
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground">Địa chỉ URL ảnh</label>
                          <input
                            required
                            value={formProduct.images?.[0] || ''}
                            onChange={(e) => setFormProduct({ ...formProduct, images: [e.target.value] })}
                            placeholder="https://images.unsplash.com/..."
                            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground">Mô tả sản phẩm</label>
                          <textarea
                            rows={3}
                            value={formProduct.description}
                            onChange={(e) => setFormProduct({ ...formProduct, description: e.target.value })}
                            placeholder="Nhập mô tả..."
                            className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary resize-none transition-colors"
                          />
                        </div>

                        {/* KHO THẺ CHÍNH SÁCH (POLICY POOL) - TÁCH RIÊNG BIỆT */}
                        <div className="space-y-3 border-t border-border pt-3 text-xs">
                          <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
                              <span>🛡️ Kho thẻ chính sách (Policy Pool)</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const samples = [
                                  'Chính hãng 100%',
                                  'Giao nhanh toàn quốc',
                                  'Lỗi 1 đổi 1',
                                  '1 đổi 1 trong 14 ngày',
                                  'Miễn phí giao hàng',
                                  'Trả góp 0% lãi suất',
                                  'Bảo hành 12 tháng',
                                  'Giao hỏa tốc 2h',
                                  'Hoàn tiền 200% nếu giả',
                                  'Thu cũ đổi mới trợ giá',
                                  'Bao giá tốt nhất',
                                  'Tặng voucher 500k',
                                  'Hỗ trợ kỹ thuật 24/7'
                                ];
                                const newTags = [...availableTags];
                                samples.forEach(s => {
                                  if (!newTags.some(t => t.type === 'policy' && t.value.toLowerCase() === s.toLowerCase())) {
                                    newTags.push({
                                      id: `policy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                      type: 'policy',
                                      value: s
                                    });
                                  }
                                });
                                setAvailableTags(newTags);
                              }}
                              className="text-[9px] font-bold text-primary hover:underline px-1.5 py-0.5 bg-primary/10 rounded cursor-pointer"
                            >
                              + Thêm nhanh chính sách mẫu
                            </button>
                          </div>

                          <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 space-y-2">
                            <div className="flex gap-1.5 items-center">
                              <input
                                type="text"
                                placeholder="Chính sách bảo hành/ưu đãi tự nhập..."
                                value={newPolicyVal}
                                onChange={(e) => setNewPolicyVal(e.target.value)}
                                className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (newPolicyVal.trim()) {
                                    const id = `policy-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                                    if (!availableTags.some(t => t.type === 'policy' && t.value.toLowerCase() === newPolicyVal.trim().toLowerCase())) {
                                      setAvailableTags([...availableTags, { id, type: 'policy', value: newPolicyVal.trim() }]);
                                    }
                                    setNewPolicyVal('');
                                  }
                                }}
                                className="px-2.5 h-8 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold rounded-lg cursor-pointer"
                              >
                                Tạo thẻ
                              </button>
                            </div>

                            {/* Danh sách thẻ chính sách trong kho */}
                            {availableTags.some(t => t.type === 'policy') && (
                              <div className="space-y-1.5 pt-1">
                                <span className="text-[9px] font-bold text-muted-foreground block">Các thẻ chính sách có sẵn (Kéo thả hoặc chọn bên dưới):</span>
                                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1 custom-scroll">
                                  {availableTags.filter(t => t.type === 'policy').map((tag) => (
                                    <div
                                      key={tag.id}
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', tag.id);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] rounded border border-emerald-500/20 font-bold select-none cursor-grab active:cursor-grabbing hover:bg-emerald-500/25 transition-colors"
                                      title="Kéo thả thẻ này vào ô chính sách sản phẩm bên dưới"
                                    >
                                      <span>{tag.value}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAvailableTags(availableTags.filter(t => t.id !== tag.id));
                                          setSelectedPolicyTagIds(selectedPolicyTagIds.filter(id => id !== tag.id));
                                        }}
                                        className="text-emerald-600 dark:text-emerald-400 hover:text-destructive font-bold text-[8px] ml-1"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* CHÍNH SÁCH BẢO HÀNH & ƯU ĐÃI (GÁN CHO SẢN PHẨM) */}
                        <div className="space-y-2 border-t border-border pt-3 text-xs">
                          <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                              <span>🛡️ Chính sách bảo hành & Ưu đãi của sản phẩm</span>
                            </label>
                          </div>
                          <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const tagId = e.dataTransfer.getData('text');
                              if (tagId) {
                                const tag = availableTags.find(t => t.id === tagId);
                                if (tag && tag.type === 'policy' && !selectedPolicyTagIds.includes(tagId)) {
                                  setSelectedPolicyTagIds([...selectedPolicyTagIds, tagId]);
                                }
                              }
                            }}
                            className="border border-dashed border-border rounded-xl p-2.5 min-h-12 bg-background flex flex-wrap gap-1.5 items-center relative group"
                          >
                            {selectedPolicyTagIds.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground/60 italic w-full text-center py-1.5 pointer-events-none">
                                Kéo thả tag chính sách vào đây hoặc chọn nhanh →
                              </span>
                            ) : (
                              selectedPolicyTagIds.map(tid => {
                                const tag = availableTags.find(t => t.id === tid);
                                if (!tag) return null;
                                return (
                                  <span
                                    key={tid}
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] rounded font-bold animate-in fade-in zoom-in-95 duration-100"
                                  >
                                    <span>{tag.value}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPolicyTagIds(selectedPolicyTagIds.filter(id => id !== tid));
                                      }}
                                      className="text-emerald-500 hover:text-destructive font-bold text-[8px] ml-1"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                );
                              })
                            )}

                            {/* Dropdown chọn nhanh tag chính sách */}
                            <div className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <select
                                value=""
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val && !selectedPolicyTagIds.includes(val)) {
                                    setSelectedPolicyTagIds([...selectedPolicyTagIds, val]);
                                  }
                                }}
                                className="bg-card border border-border rounded px-1.5 py-0.5 text-[9px] cursor-pointer text-muted-foreground focus:outline-none focus:border-primary"
                              >
                                <option value="">+ Chọn nhanh</option>
                                {availableTags.filter(t => t.type === 'policy' && !selectedPolicyTagIds.includes(t.id)).map(t => (
                                  <option key={t.id} value={t.id}>{t.value}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* KHO THẺ THUỘC TÍNH (TAGS POOL) */}
                        <div className="space-y-3 border-t border-border pt-3 text-xs">
                          <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
                              <span>🏷️ Kho thẻ thuộc tính (Tags Pool)</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const samples = [
                                  { type: 'color', value: 'Đen Graphite', colorCode: '#1c1d21' },
                                  { type: 'color', value: 'Trắng Ngọc Trai', colorCode: '#f3f4f6' },
                                  { type: 'color', value: 'Titan Sa Mạc', colorCode: '#c2b280' },
                                  { type: 'color', value: 'Xanh Mint', colorCode: '#a7f3d0' },
                                  { type: 'ram_rom', value: '8GB/256GB' },
                                  { type: 'ram_rom', value: '12GB/512GB' },
                                  { type: 'ram_rom', value: '16GB/1TB' },
                                  { type: 'condition', value: 'Mới 100%' },
                                  { type: 'condition', value: 'Likenew 99%' },
                                  { type: 'condition', value: 'Cũ 95%' },
                                  { type: 'condition', value: 'Nhập khẩu' },
                                  { type: 'condition', value: 'Trôi bảo hành' },
                                  { type: 'condition', value: 'Hàng cũ' }
                                ];
                                const newTags = [...availableTags];
                                samples.forEach(s => {
                                  if (!newTags.some(t => t.type === s.type && t.value.toLowerCase() === s.value.toLowerCase())) {
                                    newTags.push({
                                      id: `${s.type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                      type: s.type as any,
                                      value: s.value,
                                      colorCode: s.colorCode
                                    });
                                  }
                                });
                                setAvailableTags(newTags);
                              }}
                              className="text-[9px] font-bold text-primary hover:underline px-1.5 py-0.5 bg-primary/10 rounded cursor-pointer"
                            >
                              + Thêm mẫu nhanh
                            </button>
                          </div>

                          <div className="bg-muted/30 p-2.5 rounded-xl border border-border/40 space-y-2">
                            <div className="flex gap-2">
                              <span className="font-semibold text-muted-foreground text-[10px] self-center">Tạo thẻ:</span>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setNewTagType('color')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    newTagType === 'color' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground'
                                  }`}
                                >
                                  🎨 Màu sắc
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNewTagType('ram_rom')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    newTagType === 'ram_rom' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground'
                                  }`}
                                >
                                  ⚙️ RAM / ROM
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNewTagType('condition')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                                    newTagType === 'condition' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground'
                                  }`}
                                >
                                  📦 Tình trạng
                                </button>
                              </div>
                            </div>

                            {newTagType === 'color' && (
                              <div className="flex gap-1.5 items-center">
                                <input
                                  type="text"
                                  placeholder="Màu (vd: Xanh Tinh Vân)..."
                                  value={newColorName}
                                  onChange={(e) => setNewColorName(e.target.value)}
                                  className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                                />
                                <div className="flex items-center gap-1 border border-border bg-background rounded-lg px-1.5 h-8">
                                  <input
                                    type="color"
                                    value={newColorCode}
                                    onChange={(e) => setNewColorCode(e.target.value)}
                                    className="w-4 h-4 border-0 bg-transparent cursor-pointer rounded"
                                  />
                                  <span className="text-[9px] font-mono text-muted-foreground">{newColorCode.toUpperCase()}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (newColorName.trim()) {
                                      const id = `color-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                                      setAvailableTags([...availableTags, { id, type: 'color', value: newColorName.trim(), colorCode: newColorCode }]);
                                      setNewColorName('');
                                    }
                                  }}
                                  className="px-2.5 h-8 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold rounded-lg cursor-pointer"
                                >
                                  Tạo
                                </button>
                              </div>
                            )}

                            {newTagType === 'ram_rom' && (
                              <div className="flex gap-1.5 items-center">
                                <input
                                  type="text"
                                  placeholder="RAM (vd: 12GB)..."
                                  value={newRamVal}
                                  onChange={(e) => setNewRamVal(e.target.value)}
                                  className="w-20 h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                                />
                                <span className="text-muted-foreground">/</span>
                                <input
                                  type="text"
                                  placeholder="ROM (vd: 512GB)..."
                                  value={newRomVal}
                                  onChange={(e) => setNewRomVal(e.target.value)}
                                  className="w-20 h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (newRamVal.trim() || newRomVal.trim()) {
                                      const combined = `${newRamVal.trim()}/${newRomVal.trim()}`;
                                      const id = `ramrom-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                                      setAvailableTags([...availableTags, { id, type: 'ram_rom', value: combined }]);
                                      setNewRamVal('');
                                      setNewRomVal('');
                                    }
                                  }}
                                  className="px-2.5 h-8 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold rounded-lg cursor-pointer"
                                >
                                  Tạo
                                </button>
                              </div>
                            )}

                            {newTagType === 'condition' && (
                              <div className="space-y-2">
                                <div className="flex gap-1.5 items-center">
                                  <input
                                    type="text"
                                    placeholder="Tình trạng (vd: Likenew 99%)..."
                                    value={newConditionVal}
                                    onChange={(e) => setNewConditionVal(e.target.value)}
                                    className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (newConditionVal.trim()) {
                                        const id = `condition-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                                        if (!availableTags.some(t => t.type === 'condition' && t.value.toLowerCase() === newConditionVal.trim().toLowerCase())) {
                                          setAvailableTags([...availableTags, { id, type: 'condition', value: newConditionVal.trim() }]);
                                        }
                                        setNewConditionVal('');
                                      }
                                    }}
                                    className="px-2.5 h-8 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold rounded-lg cursor-pointer"
                                  >
                                    Tạo
                                  </button>
                                </div>

                                <div className="space-y-1">
                                  <span className="text-[9px] font-bold text-muted-foreground block">Chọn nhanh tình trạng:</span>
                                  <div className="flex gap-1 overflow-x-auto pb-1 pt-0.5 custom-scroll scroll-smooth">
                                    {[
                                      'Mới 100%',
                                      'Likenew 99%',
                                      'Cũ 95%',
                                      'Cũ 90%',
                                      'Nhập khẩu',
                                      'Chính hãng',
                                      'Trôi bảo hành',
                                      'Hàng cũ',
                                      'Refurbished'
                                    ].map((opt) => (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => {
                                          const id = `condition-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                                          if (!availableTags.some(t => t.type === 'condition' && t.value.toLowerCase() === opt.toLowerCase())) {
                                            setAvailableTags([...availableTags, { id, type: 'condition', value: opt }]);
                                          }
                                        }}
                                        className="px-2 py-0.5 rounded bg-background hover:bg-muted text-[9px] text-foreground border border-border font-bold transition-colors cursor-pointer flex-shrink-0"
                                      >
                                        + {opt}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Hiển thị các tag trong kho theo phân nhóm danh mục thẻ */}
                          <div className="space-y-2 py-1 max-h-36 overflow-y-auto pr-1 custom-scroll">
                            {availableTags.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">Kho thẻ trống. Nhấp thêm mẫu nhanh hoặc tự tạo thẻ ở trên.</span>
                            ) : (
                              <>
                                {/* Nhóm Màu sắc */}
                                {availableTags.some(t => t.type === 'color') && (
                                  <div className="space-y-1">
                                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">🎨 Màu sắc:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {availableTags.filter(t => t.type === 'color').map((tag) => (
                                        <div
                                          key={tag.id}
                                          draggable
                                          onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', tag.id);
                                          }}
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-secondary text-foreground text-[10px] rounded border border-border font-bold select-none cursor-grab active:cursor-grabbing hover:bg-muted transition-colors"
                                          title="Kéo thả thẻ này vào ô phiên bản bên dưới hoặc click chọn trong dòng"
                                        >
                                          {tag.colorCode && (
                                            <span className="w-1.5 h-1.5 rounded-full border border-border/20" style={{ backgroundColor: tag.colorCode }} />
                                          )}
                                          <span>{tag.value}</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAvailableTags(availableTags.filter(t => t.id !== tag.id));
                                              setVariantSpecs(variantSpecs.map(vs => ({
                                                ...vs,
                                                tagIds: vs.tagIds.filter(id => id !== tag.id)
                                              })));
                                            }}
                                            className="text-muted-foreground hover:text-destructive font-bold text-[8px] ml-1"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Nhóm RAM/ROM */}
                                {availableTags.some(t => t.type === 'ram_rom') && (
                                  <div className="space-y-1 mt-1.5">
                                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">⚙️ RAM / ROM:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {availableTags.filter(t => t.type === 'ram_rom').map((tag) => (
                                        <div
                                          key={tag.id}
                                          draggable
                                          onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', tag.id);
                                          }}
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-secondary text-foreground text-[10px] rounded border border-border font-bold select-none cursor-grab active:cursor-grabbing hover:bg-muted transition-colors"
                                          title="Kéo thả thẻ này vào ô phiên bản bên dưới"
                                        >
                                          <span>{tag.value}</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAvailableTags(availableTags.filter(t => t.id !== tag.id));
                                              setVariantSpecs(variantSpecs.map(vs => ({
                                                ...vs,
                                                tagIds: vs.tagIds.filter(id => id !== tag.id)
                                              })));
                                            }}
                                            className="text-muted-foreground hover:text-destructive font-bold text-[8px] ml-1"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {/* Nhóm Tình trạng */}
                                {availableTags.some(t => t.type === 'condition') && (
                                  <div className="space-y-1 mt-1.5">
                                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">📦 Tình trạng / Phân loại:</div>
                                    <div className="flex flex-wrap gap-1">
                                      {availableTags.filter(t => t.type === 'condition').map((tag) => (
                                        <div
                                          key={tag.id}
                                          draggable
                                          onDragStart={(e) => {
                                            e.dataTransfer.setData('text/plain', tag.id);
                                          }}
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-secondary text-foreground text-[10px] rounded border border-border font-bold select-none cursor-grab active:cursor-grabbing hover:bg-muted transition-colors"
                                          title="Kéo thả thẻ này vào ô phiên bản bên dưới"
                                        >
                                          <span>{tag.value}</span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAvailableTags(availableTags.filter(t => t.id !== tag.id));
                                              setVariantSpecs(variantSpecs.map(vs => ({
                                                ...vs,
                                                tagIds: vs.tagIds.filter(id => id !== tag.id)
                                              })));
                                            }}
                                            className="text-muted-foreground hover:text-destructive font-bold text-[8px] ml-1"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              </>
                            )}
                          </div>
                        </div>



                        {/* PHIÊN BẢN SẢN PHẨM & GHI GIÁ */}
                        <div className="space-y-3 border-t border-border pt-3 text-xs">
                          <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-muted-foreground">⚙️ Phiên bản sản phẩm</label>
                            <button
                              type="button"
                              onClick={() => {
                                const id = `variant-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
                                const newSpecs = [...variantSpecs, { id, price: '', tagIds: [] }];
                                setVariantSpecs(newSpecs);
                                setSelectedVariantIdx(newSpecs.length - 1);
                              }}
                              className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Tạo phiên bản</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-12 gap-3 border border-border/50 rounded-xl p-2 bg-muted/10 min-h-64">
                            {/* Cột trái: Chọn phiên bản */}
                            <div className="col-span-4 border-r border-border/40 pr-2 flex flex-col gap-1.5 max-h-72 overflow-y-auto custom-scroll">
                              {variantSpecs.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground italic text-center py-8">
                                  Chưa có phiên bản
                                </p>
                              ) : (
                                variantSpecs.map((vs, idx) => {
                                  // Lấy tên tóm tắt phiên bản để render lên tab
                                  const tags = vs.tagIds.map(tid => availableTags.find(t => t.id === tid)).filter(Boolean) as VariantTag[];
                                  const colorTag = tags.find(t => t.type === 'color');
                                  const ramRomTag = tags.find(t => t.type === 'ram_rom');
                                  const condTag = tags.find(t => t.type === 'condition');
                                  
                                  const colorVal = colorTag ? colorTag.value : '';
                                  const ramRomVal = ramRomTag ? ramRomTag.value : '';
                                  const condVal = condTag ? condTag.value : '';
                                  const labelParts = [];
                                  if (colorVal) labelParts.push(colorVal);
                                  if (ramRomVal) labelParts.push(ramRomVal);
                                  if (condVal) labelParts.push(condVal);
                                  const summary = labelParts.length > 0 ? labelParts.join(' / ') : `Phiên bản #${idx + 1}`;

                                  return (
                                    <button
                                      key={vs.id}
                                      type="button"
                                      onClick={() => setSelectedVariantIdx(idx)}
                                      className={`w-full text-left p-2 rounded-lg text-[10px] font-bold transition-all relative border flex flex-col gap-0.5 cursor-pointer ${
                                        selectedVariantIdx === idx
                                          ? 'bg-primary/10 border-primary text-primary shadow-sm'
                                          : 'bg-card border-border/60 hover:bg-muted text-foreground'
                                      }`}
                                    >
                                      <span className={selectedVariantIdx === idx ? 'text-primary/75 text-[9px]' : 'text-muted-foreground text-[9px]'}>
                                        # {idx + 1}
                                      </span>
                                      <span className="truncate w-full block">{summary}</span>
                                      {vs.price && (
                                        <span className="text-[8px] font-normal text-muted-foreground mt-0.5">
                                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(vs.price))}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>

                            {/* Cột phải: Form chi tiết phiên bản đang chọn */}
                            <div className="col-span-8 flex flex-col justify-between">
                              {variantSpecs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                  <p className="text-xs text-muted-foreground italic">
                                    Bấm "+ Tạo phiên bản" để thêm cấu hình mới cho sản phẩm.
                                  </p>
                                </div>
                              ) : (
                                (() => {
                                  // Bảo vệ fallback index
                                  const currentIdx = selectedVariantIdx >= variantSpecs.length ? variantSpecs.length - 1 : selectedVariantIdx;
                                  const vs = variantSpecs[currentIdx];
                                  if (!vs) return null;

                                  const tags = vs.tagIds.map(tid => availableTags.find(t => t.id === tid)).filter(Boolean) as VariantTag[];
                                  const colorTag = tags.find(t => t.type === 'color');
                                  const ramRomTag = tags.find(t => t.type === 'ram_rom');
                                  const condTag = tags.find(t => t.type === 'condition');
                                  const colorVal = colorTag ? colorTag.value : '';
                                  const ramRomVal = ramRomTag ? ramRomTag.value : '';
                                  const condVal = condTag ? condTag.value : '';
                                  const labelParts = [];
                                  if (colorVal) labelParts.push(colorVal);
                                  if (ramRomVal) labelParts.push(ramRomVal);
                                  if (condVal) labelParts.push(condVal);
                                  const finalLabel = labelParts.length > 0 ? labelParts.join(' - ') : 'Phiên bản chưa gán thuộc tính';

                                  return (
                                    <div className="space-y-3 p-1 animate-in fade-in duration-150 h-full flex flex-col justify-between">
                                      <div className="space-y-3">
                                        {/* Header chi tiết phiên bản */}
                                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                                          <div>
                                            <span className="text-[10px] font-bold text-muted-foreground">Chi tiết phiên bản #{currentIdx + 1}</span>
                                            <h4 className="text-xs font-black text-foreground mt-0.5 truncate max-w-[150px]" title={finalLabel}>{finalLabel}</h4>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const newSpecs = variantSpecs.filter(item => item.id !== vs.id);
                                              setVariantSpecs(newSpecs);
                                              setSelectedVariantIdx(Math.max(0, currentIdx - 1));
                                            }}
                                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                            title="Xóa phiên bản này"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>

                                        {/* Vùng Drop tags */}
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-muted-foreground">🏷️ Tag thuộc tính đã gán:</label>
                                          <div
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              const tagId = e.dataTransfer.getData('text');
                                              if (tagId && !vs.tagIds.includes(tagId)) {
                                                const exists = availableTags.some(t => t.id === tagId);
                                                if (exists) {
                                                  setVariantSpecs(variantSpecs.map((item, index) => index === currentIdx ? { ...item, tagIds: [...item.tagIds, tagId] } : item));
                                                }
                                              }
                                            }}
                                            className="border border-dashed border-border rounded-lg p-2 min-h-12 bg-background flex flex-wrap gap-1.5 items-center relative group"
                                          >
                                            {vs.tagIds.length === 0 ? (
                                              <span className="text-[10px] text-muted-foreground/60 italic w-full text-center py-1 pointer-events-none">
                                                Kéo thả tag ở trên vào hoặc chọn →
                                              </span>
                                            ) : (
                                              vs.tagIds.map(tid => {
                                                const tag = availableTags.find(t => t.id === tid);
                                                if (!tag) return null;
                                                return (
                                                  <span
                                                    key={tid}
                                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[10px] rounded font-bold animate-in fade-in zoom-in-95 duration-100"
                                                  >
                                                    {tag.type === 'color' && tag.colorCode && (
                                                      <span className="w-1.5 h-1.5 rounded-full border border-border/20" style={{ backgroundColor: tag.colorCode }} />
                                                    )}
                                                    <span>{tag.value}</span>
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setVariantSpecs(variantSpecs.map((item, index) => index === currentIdx ? { ...item, tagIds: item.tagIds.filter(id => id !== tid) } : item));
                                                      }}
                                                      className="text-primary hover:text-destructive font-bold text-[8px] ml-1"
                                                    >
                                                      ✕
                                                    </button>
                                                  </span>
                                                );
                                              })
                                            )}

                                            {/* Dropdown chọn nhanh tag */}
                                            <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <select
                                                value=""
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  if (val && !vs.tagIds.includes(val)) {
                                                    setVariantSpecs(variantSpecs.map((item, index) => index === currentIdx ? { ...item, tagIds: [...item.tagIds, val] } : item));
                                                  }
                                                }}
                                                className="bg-card border border-border rounded px-1 py-0.5 text-[9px] cursor-pointer text-muted-foreground focus:outline-none focus:border-primary"
                                              >
                                                <option value="">+ Thêm nhanh</option>
                                                {availableTags.filter(t => !vs.tagIds.includes(t.id)).map(t => (
                                                  <option key={t.id} value={t.id}>[{t.type === 'color' ? '🎨' : t.type === 'ram_rom' ? '⚙️' : '📦'}] {t.value}</option>
                                                ))}
                                              </select>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Các fields nhập */}
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-muted-foreground">Giá bán (VNĐ)</label>
                                            <input
                                              type="number"
                                              placeholder="Giá riêng bản này..."
                                              value={vs.price}
                                              onChange={(e) => {
                                                setVariantSpecs(variantSpecs.map((item, index) => index === currentIdx ? { ...item, price: e.target.value } : item));
                                              }}
                                              className="w-full h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-muted-foreground">URL ảnh riêng (Tùy chọn)</label>
                                            <input
                                              type="text"
                                              placeholder="https://..."
                                              value={vs.image || ''}
                                              onChange={(e) => {
                                                setVariantSpecs(variantSpecs.map((item, index) => index === currentIdx ? { ...item, image: e.target.value } : item));
                                              }}
                                              className="w-full h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                                            />
                                          </div>
                                        </div>
                                      </div>

                                      {vs.image && (
                                        <div className="mt-2 flex items-center gap-2 border border-border/40 p-1.5 rounded-lg bg-background/50">
                                          <img src={vs.image} alt="Variant preview" className="w-8 h-8 object-contain rounded border border-border" />
                                          <span className="text-[9px] text-muted-foreground truncate flex-1">{vs.image}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              )}
                            </div>
                          </div>
                        </div>


                        {/* SPECS EDITOR (KEY-VALUE ĐỘNG) */}
                        <div className="space-y-2 border-t border-border pt-3">
                          <div className="flex justify-between items-center">
                            <label className="text-[11px] font-bold text-muted-foreground">Thông số kỹ thuật (Specs)</label>
                            <button
                              type="button"
                              onClick={addSpecRow}
                              className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Thêm</span>
                            </button>
                          </div>

                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {specRows.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic text-center">Chưa có thông số kỹ thuật.</p>
                            ) : (
                              specRows.map((row, idx) => (
                                <div key={idx} className="flex gap-1.5 items-center">
                                  <input
                                    type="text"
                                    placeholder="Tên (vd: CPU)"
                                    value={row.key}
                                    onChange={(e) => updateSpecRow(idx, 'key', e.target.value)}
                                    className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Giá trị (vd: Apple M3)"
                                    value={row.value}
                                    onChange={(e) => updateSpecRow(idx, 'value', e.target.value)}
                                    className="flex-1 h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeSpecRow(idx)}
                                    className="p-1.5 rounded-lg border border-border hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-4 pb-5 border-t border-border bg-card sticky bottom-0 z-10">
                          <button
                            type="button"
                            onClick={() => setModalOpen(false)}
                            className="flex-1 h-9 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Hủy
                          </button>
                          <button
                            type="submit"
                            disabled={savingProduct}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-xs font-bold shadow-md shadow-primary/15 active:scale-[0.98] transition-all cursor-pointer"
                          >
                            {savingProduct ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            <span>{editingProduct ? 'Lưu thay đổi' : 'Thêm sản phẩm'}</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ========================================== */}
        {/* PANEL: ĐƠN HÀNG (ORDERS) */}
        {/* ========================================== */}
        {panel === 'orders' && (
          <div className="space-y-4">
            <div className="border-b border-border pb-4">
              <h1 className="text-xl sm:text-2xl font-black text-foreground">Quản lý đơn hàng ({orders.length})</h1>
              <p className="text-xs text-muted-foreground">Theo dõi đơn hàng, địa chỉ giao hàng và trực tiếp chuyển trạng thái vận chuyển</p>
            </div>

            {/* Tìm kiếm + Bảng + Sidebar bọc trong layout Split View */}
            <div className="flex flex-col lg:flex-row gap-6 items-start relative w-full">
              {/* CỘT TRÁI: DANH SÁCH ĐƠN HÀNG */}
              <div className={`space-y-4 transition-all duration-300 ${selectedOrder ? 'flex-1 min-w-0' : 'w-full'}`}>
                {/* Tìm kiếm */}
                <div className="relative max-w-sm">
                  <input
                    type="text"
                    placeholder="Tìm mã đơn hoặc địa chỉ..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-xl border border-border bg-background text-foreground placeholder-muted-foreground/60 text-sm focus:outline-none focus:border-primary"
                  />
                  <Search className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
                </div>

                {/* Bảng đơn hàng */}
                <div className="rounded-2xl border border-border overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                      <tr>
                        <th className="text-left font-semibold px-4 py-3">Mã đơn</th>
                        {!selectedOrder && <th className="text-left font-semibold px-4 py-3">Đặt lúc</th>}
                        {!selectedOrder && <th className="text-left font-semibold px-4 py-3">Địa chỉ giao</th>}
                        <th className="text-left font-semibold px-4 py-3">Trạng thái</th>
                        <th className="text-right font-semibold px-4 py-3">Tổng tiền</th>
                        <th className="text-right font-semibold px-4 py-3">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredOrders.map((o) => (
                        <tr key={o.id} className={`hover:bg-muted/30 transition-colors ${selectedOrder?.id === o.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">#{o.id.substring(0, 8)}...</td>
                          {!selectedOrder && <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(o.created_at)}</td>}
                          {!selectedOrder && <td className="px-4 py-3 text-muted-foreground text-xs max-w-[240px] truncate">{o.shipping_address}</td>}
                          <td className="px-4 py-3">{getOrderStatusBadge(o.status)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap">{formatPrice(o.total)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setSelectedOrder(o)}
                              className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-bold text-foreground cursor-pointer transition-colors"
                            >
                              Xem chi tiết
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredOrders.length === 0 && (
                        <tr>
                          <td colSpan={selectedOrder ? 4 : 6} className="px-4 py-10 text-center text-muted-foreground text-sm">Không tìm thấy đơn hàng nào.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* CỘT PHẢI: CHI TIẾT ĐƠN HÀNG (STICKY SIDEBAR) */}
              {selectedOrder && (
                <div className="w-full lg:w-[480px] xl:w-[500px] bg-card border border-border rounded-2xl shadow-2xl p-5 sticky top-6 max-h-[calc(100vh-160px)] overflow-y-auto custom-scroll animate-in slide-in-from-right duration-300 flex-shrink-0 space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <h2 className="text-sm font-bold text-foreground">Chi tiết đơn #{selectedOrder.id.substring(0, 8)}...</h2>
                    <button onClick={() => setSelectedOrder(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Thông tin vận chuyển */}
                  <div className="space-y-2.5 bg-muted/30 p-4 rounded-xl border border-border text-xs">
                    <h3 className="font-bold text-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                      <span>Thông tin giao hàng</span>
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">{selectedOrder.shipping_address}</p>
                    <div className="flex items-center gap-1.5 text-muted-foreground pt-1 border-t border-border/40 mt-1">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span>Đặt lúc: {formatDate(selectedOrder.created_at)}</span>
                    </div>
                  </div>

                  {/* Thay đổi trạng thái đơn */}
                  <div className="space-y-2 border-t border-border pt-3 text-xs">
                    <label className="text-[11px] font-bold text-muted-foreground block">Trạng thái vận chuyển:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['pending', 'processing', 'shipping', 'delivered', 'cancelled'].map((st) => (
                        <button
                          key={st}
                          disabled={updatingOrderStatus}
                          onClick={() => handleUpdateOrderStatus(selectedOrder.id, st)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                            selectedOrder.status === st 
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20' 
                              : 'bg-background hover:bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          {st === 'pending' && 'Chờ xử lý'}
                          {st === 'processing' && 'Duyệt / Chuẩn bị'}
                          {st === 'shipping' && 'Bắt đầu giao'}
                          {st === 'delivered' && 'Hoàn thành'}
                          {st === 'cancelled' && 'Hủy đơn'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Danh sách sản phẩm */}
                  <div className="space-y-3 border-t border-border pt-3 text-xs">
                    <h3 className="font-bold text-foreground">Sản phẩm đã mua</h3>
                    <div className="space-y-3 max-h-52 overflow-y-auto pr-1 custom-scroll">
                      {selectedOrder.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex gap-3 items-center justify-between border-b border-border/40 pb-2">
                          <div className="flex gap-2 items-center">
                            <div className="w-10 h-10 rounded-lg border border-border p-1 bg-background flex-shrink-0 flex items-center justify-center">
                              <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                            </div>
                            <div>
                              <p className="font-bold text-foreground line-clamp-1 text-[11px]">{item.name}</p>
                              <p className="text-[10px] text-muted-foreground">Giá bán: {formatPrice(item.price)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground">x{item.quantity}</span>
                            <p className="font-bold text-foreground">{formatPrice(item.price * item.quantity)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tổng thanh toán */}
                  <div className="flex justify-between items-center border-t border-border pt-3 text-xs font-bold bg-muted/10 p-2.5 rounded-xl">
                    <span className="text-muted-foreground">Tổng cộng:</span>
                    <span className="text-sm text-primary font-black">{formatPrice(selectedOrder.total)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* PANEL: NHÂN VIÊN & NGƯỜI DÙNG (USERS) */}
        {/* ========================================== */}
        {panel === 'users' && (() => {
          const removeUserTones = (str: string) =>
            str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

          const filteredUsers = users.filter((u) => {
            const role = u.user_metadata?.role || 'customer';
            const isStaff = role === 'admin' || role === 'staff';
            const matchesTab = userTab === 'staff' ? isStaff : !isStaff;

            let matchesSearch = true;
            if (userSearch.trim()) {
              const qClean = removeUserTones(userSearch.trim());
              const queryWords = qClean.split(/\s+/).filter(Boolean);
              const fullNameClean = removeUserTones(u.user_metadata?.full_name || '');
              const emailClean = removeUserTones(u.email || '');
              const idLower = (u.id || '').toLowerCase();
              const phoneClean = removeUserTones(u.user_metadata?.phone || '');
              const corpus = `${fullNameClean} ${emailClean} ${idLower} ${phoneClean}`;
              const corpusWords = corpus.split(/[\s\-\/\@\.\,]+/).filter(Boolean);
              matchesSearch = queryWords.every(qw =>
                corpusWords.some(cw => cw.startsWith(qw)) || idLower.includes(qw)
              );
            }

            return matchesTab && matchesSearch;
          });

          return (
            <div className="space-y-4">
              <div className="border-b border-border pb-4 flex justify-between items-center">
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-foreground">Nhân viên & Khách hàng</h1>
                  <p className="text-xs text-muted-foreground">Danh sách tài khoản đã đăng ký và phân loại vai trò (Role)</p>
                </div>
                <button 
                  onClick={fetchUsersList}
                  disabled={isUsersLoading}
                  className="p-2.5 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all cursor-pointer"
                  title="Làm mới"
                >
                  <RefreshCw className={`w-4 h-4 ${isUsersLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Ô TÌM KIẾM & TAB BÊN TRÊN BẢNG */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card/25 border border-border/80 p-3.5 rounded-2xl">
                {/* Tabs */}
                <div className="flex bg-muted/60 p-1 rounded-xl border border-border/50 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setUserTab('staff')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      userTab === 'staff'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    💼 Nhân viên / Admin ({users.filter(u => {
                      const r = u.user_metadata?.role || 'customer';
                      return r === 'admin' || r === 'staff';
                    }).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserTab('customer')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      userTab === 'customer'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    👤 Khách hàng ({users.filter(u => {
                      const r = u.user_metadata?.role || 'customer';
                      return r !== 'admin' && r !== 'staff';
                    }).length})
                  </button>
                </div>

                {/* Ô tìm kiếm */}
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Tìm theo tên, email, ID..."
                    className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary transition-colors"
                  />
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              {isUsersLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
              ) : (
                <div className="flex flex-col lg:flex-row gap-6 items-start relative w-full">
                  {/* CỘT TRÁI: DANH SÁCH NGƯỜI DÙNG */}
                  <div className={`space-y-4 transition-all duration-300 ${selectedUserDetail ? 'flex-1 min-w-0' : 'w-full'}`}>
                    <div className="rounded-2xl border border-border overflow-x-auto overflow-y-visible custom-scroll min-h-[280px]">
                      <table className="w-full text-sm min-w-[500px] overflow-visible">
                        <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                          <tr>
                            <th className="text-left font-semibold px-4 py-3">Người dùng</th>
                            {!selectedUserDetail && <th className="text-left font-semibold px-4 py-3">Email</th>}
                            {!selectedUserDetail && <th className="text-left font-semibold px-4 py-3">Đăng ký ngày</th>}
                            <th className="text-left font-semibold px-4 py-3">Quyền hạn (Role)</th>
                            <th className="text-right font-semibold px-4 py-3">Gán Role</th>
                            <th className="text-right font-semibold px-4 py-3">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border overflow-visible">
                          {filteredUsers.map((u) => {
                            const role = u.user_metadata?.role || 'customer';
                          return (
                            <tr key={u.id} className={`hover:bg-muted/30 transition-colors ${selectedUserDetail?.id === u.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {u.user_metadata?.avatar_url ? (
                                    <img src={u.user_metadata.avatar_url} alt="avatar" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold uppercase flex-shrink-0">
                                      {u.email?.substring(0, 2)}
                                    </div>
                                  )}
                                  <span className="font-semibold text-foreground truncate max-w-[140px]">{u.user_metadata?.full_name || 'Khách hàng'}</span>
                                </div>
                              </td>
                              {!selectedUserDetail && <td className="px-4 py-3 text-muted-foreground">{u.email}</td>}
                              {!selectedUserDetail && <td className="px-4 py-3 text-xs text-muted-foreground">{u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : ''}</td>}
                              <td className="px-4 py-3">
                                <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wide ${
                                  role === 'admin' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : role === 'staff' ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' : 'bg-muted text-muted-foreground border-border'
                                }`}>
                                  {role === 'admin' ? 'Quản trị' : role === 'staff' ? 'Nhân viên' : 'Khách hàng'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {isAdmin ? (
                                  <div className="relative inline-block text-left role-dropdown-container">
                                    <button
                                      type="button"
                                      disabled={updatingUserRole === u.id}
                                      onClick={() => setActiveUserRoleDropdown(activeUserRoleDropdown === u.id ? null : u.id)}
                                      className={`h-8 px-2.5 rounded-lg border text-xs flex items-center justify-between gap-1.5 cursor-pointer disabled:opacity-50 transition-all ${
                                        activeUserRoleDropdown === u.id
                                          ? 'border-primary bg-primary/5 text-foreground'
                                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                      }`}
                                    >
                                      <span>
                                        {role === 'admin' ? 'Quản trị' : role === 'staff' ? 'Nhân viên' : 'Khách hàng'}
                                      </span>
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                    
                                    {activeUserRoleDropdown === u.id && (
                                      <div className="absolute top-[calc(100%+4px)] right-0 w-36 bg-card border border-border rounded-xl shadow-2xl p-1 z-35 animate-in fade-in slide-in-from-top-1 duration-150">
                                        <div className="max-h-36 overflow-y-auto pr-1 custom-scroll space-y-0.5">
                                          {[
                                            { val: 'customer', label: 'Khách hàng' },
                                            { val: 'staff', label: 'Nhân viên' },
                                            { val: 'admin', label: 'Quản trị viên' }
                                          ].map((opt) => (
                                            <div
                                              key={opt.val}
                                              onClick={() => {
                                                setActiveUserRoleDropdown(null);
                                                if (opt.val !== role) {
                                                  setPendingRoleChange({ userId: u.id, newRole: opt.val });
                                                  setRoleConfirmOpen(true);
                                                }
                                              }}
                                              className={`px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                                role === opt.val ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                                              }`}
                                            >
                                              {opt.label}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/60 italic font-medium">Chỉ Admin được gán</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={async () => {
                                    setSelectedUserDetail(u);
                                    setUserOrderStats({ totalOrders: 0, completedOrders: 0, cancelledOrders: 0, totalSpent: 0, totalItems: 0, categoryBreakdown: {}, isLoading: true });
                                    try {
                                      const { data: ordersData } = await supabase
                                        .from('orders')
                                        .select('*')
                                        .eq('user_id', u.id)
                                        .order('created_at', { ascending: false });
                                      const ords = ordersData || [];
                                      const completed = ords.filter((o: any) => o.status === 'delivered' || o.status === 'completed');
                                      const cancelled = ords.filter((o: any) => o.status === 'cancelled');
                                      const totalSpent = completed.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
                                      // Đếm số sản phẩm và phân loại
                                      let totalItems = 0;
                                      const categoryBreakdown: Record<string, number> = {};
                                      completed.forEach((o: any) => {
                                        const items = o.items || [];
                                        items.forEach((item: any) => {
                                          totalItems += (item.quantity || 1);
                                          const cat = item.category || item.cat || 'Khác';
                                          categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (item.quantity || 1);
                                        });
                                      });
                                      setUserOrderStats({ totalOrders: ords.length, completedOrders: completed.length, cancelledOrders: cancelled.length, totalSpent, totalItems, categoryBreakdown, isLoading: false });
                                    } catch {
                                      setUserOrderStats(prev => prev ? { ...prev, isLoading: false } : null);
                                    }
                                  }}
                                  className="px-2.5 py-1 text-xs rounded-lg border border-border hover:bg-muted text-foreground font-bold cursor-pointer transition-colors"
                                >
                                  Xem chi tiết
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {users.length === 0 && (
                          <tr>
                            <td colSpan={selectedUserDetail ? 4 : 6} className="px-4 py-10 text-center text-muted-foreground text-sm">Không tải được thông tin thành viên.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CỘT PHẢI: CHI TIẾT NGƯỜI DÙNG / NHÂN VIÊN (STICKY SIDEBAR) */}
                {selectedUserDetail && (
                  <div className="w-full lg:w-[400px] xl:w-[440px] bg-card border border-border rounded-2xl shadow-2xl p-5 sticky top-6 max-h-[calc(100vh-160px)] overflow-y-auto custom-scroll animate-in slide-in-from-right duration-300 flex-shrink-0 space-y-4 text-xs">
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <h2 className="text-sm font-bold text-foreground">Thông tin tài khoản</h2>
                      <button onClick={() => setSelectedUserDetail(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-col items-center py-4 space-y-3 bg-muted/20 rounded-xl border border-border">
                      {selectedUserDetail.user_metadata?.avatar_url ? (
                        <img src={selectedUserDetail.user_metadata.avatar_url} alt="avatar" className="w-16 h-16 rounded-full border border-border object-cover" />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold uppercase border border-border">
                          {selectedUserDetail.email?.substring(0, 2)}
                        </div>
                      )}
                      <div className="text-center">
                        <h3 className="font-bold text-foreground text-sm">{selectedUserDetail.user_metadata?.full_name || 'Khách hàng'}</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{selectedUserDetail.email}</p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center py-1.5 border-b border-border/40 font-bold">
                        <span className="text-muted-foreground font-medium">Mã tài khoản (UID):</span>
                        <span className="font-mono text-[10px] text-foreground">{selectedUserDetail.id}</span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-border/40 font-bold">
                        <span className="text-muted-foreground font-medium">Vai trò hệ thống:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${
                          (selectedUserDetail.user_metadata?.role || 'customer') === 'admin'
                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                            : (selectedUserDetail.user_metadata?.role || 'customer') === 'staff'
                            ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
                            : 'bg-muted text-muted-foreground border-border'
                        }`}>
                          {(selectedUserDetail.user_metadata?.role || 'customer') === 'admin' ? 'Quản trị' : (selectedUserDetail.user_metadata?.role || 'customer') === 'staff' ? 'Nhân viên' : 'Khách hàng'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-border/40 font-bold">
                        <span className="text-muted-foreground font-medium">Số điện thoại:</span>
                        <span className="text-foreground">{selectedUserDetail.user_metadata?.phone || <span className="italic text-muted-foreground/50 text-[10px]">Chưa cung cấp</span>}</span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-border/40 font-bold">
                        <span className="text-muted-foreground font-medium">Ngày sinh:</span>
                        <span className="text-foreground">
                          {selectedUserDetail.user_metadata?.birthday
                            ? new Date(selectedUserDetail.user_metadata.birthday).toLocaleDateString('vi-VN')
                            : <span className="italic text-muted-foreground/50 text-[10px]">Chưa cung cấp</span>}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-border/40 font-bold">
                        <span className="text-muted-foreground font-medium">Địa chỉ:</span>
                        <span className="text-foreground text-right max-w-[60%]">{selectedUserDetail.user_metadata?.address || <span className="italic text-muted-foreground/50 text-[10px]">Chưa cung cấp</span>}</span>
                      </div>
                      <div className="flex justify-between items-center py-1.5 border-b border-border/40 font-bold">
                        <span className="text-muted-foreground font-medium">Ngày đăng ký:</span>
                        <span className="text-foreground">
                          {selectedUserDetail.created_at ? new Date(selectedUserDetail.created_at).toLocaleDateString('vi-VN') + ' ' + new Date(selectedUserDetail.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      {/* ── THỐNG KÊ MUA HÀNG ── */}
                      <div className="space-y-2 border-t border-border pt-3">
                        <p className="text-[11px] font-black text-foreground flex items-center gap-1.5 mb-2">
                          📊 Thống kê mua hàng
                        </p>
                        {userOrderStats?.isLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          </div>
                        ) : userOrderStats ? (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5 text-center">
                                <div className="text-base font-black text-primary">{userOrderStats.completedOrders}</div>
                                <div className="text-[10px] text-muted-foreground">Đơn hoàn thành</div>
                              </div>
                              <div className="bg-muted/40 border border-border rounded-xl p-2.5 text-center">
                                <div className="text-base font-black text-foreground">{userOrderStats.totalOrders}</div>
                                <div className="text-[10px] text-muted-foreground">Tổng đơn hàng</div>
                              </div>
                              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-2.5 text-center">
                                <div className="text-base font-black text-emerald-500">{userOrderStats.totalItems}</div>
                                <div className="text-[10px] text-muted-foreground">Sản phẩm đã mua</div>
                              </div>
                              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-2.5 text-center">
                                <div className="text-base font-black text-rose-500">{userOrderStats.cancelledOrders}</div>
                                <div className="text-[10px] text-muted-foreground">Đơn đã hủy</div>
                              </div>
                            </div>
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex justify-between items-center mt-1">
                              <span className="text-[11px] font-semibold text-muted-foreground">💰 Tổng chi tiêu (đơn hoàn thành):</span>
                              <span className="text-sm font-black text-amber-500">{formatPrice(userOrderStats.totalSpent)}</span>
                            </div>
                            {Object.keys(userOrderStats.categoryBreakdown).length > 0 && (
                              <div className="space-y-1.5 mt-1">
                                <p className="text-[10px] font-bold text-muted-foreground">Phân loại sản phẩm đã mua:</p>
                                {Object.entries(userOrderStats.categoryBreakdown)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([cat, qty]) => (
                                    <div key={cat} className="flex justify-between items-center">
                                      <span className="text-[11px] text-muted-foreground capitalize">{cat}</span>
                                      <span className="text-[11px] font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">{qty} sp</span>
                                    </div>
                                  ))}
                              </div>
                            )}
                            {/* NHẬN XÉT KHÁCH HÀNG */}
                            <div className={`rounded-xl p-2.5 border text-[10px] font-semibold mt-1 ${
                              userOrderStats.totalSpent >= 50000000
                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                                : userOrderStats.totalSpent >= 10000000
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                : userOrderStats.completedOrders === 0
                                ? 'bg-muted/50 border-border text-muted-foreground'
                                : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                            }`}>
                              {userOrderStats.totalSpent >= 50000000
                                ? '🏆 Khách VIP – Tri ân & ưu đãi đặc biệt'
                                : userOrderStats.totalSpent >= 10000000
                                ? '⭐ Khách gắn bó – Nên duy trì ưu đãi'
                                : userOrderStats.completedOrders === 0
                                ? '😴 Chưa mua hàng / Ít hoạt động – Cân nhắc món hời'
                                : '🛒 Khách tiềm năng – Tiếp tục chăm sóc'}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

        {/* ========================================== */}
        {/* PANEL: HỖ TRỢ KHÁCH HÀNG (TICKETS) */}
        {/* ========================================== */}
        {panel === 'tickets' && (
          <div className="space-y-4">
            <div className="border-b border-border pb-4 flex justify-between items-center">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-foreground">Ticket hỗ trợ ({tickets.length})</h1>
                <p className="text-xs text-muted-foreground">Đồng bộ các yêu cầu đàm phán giá, kỹ thuật do AI Chatbot phát hiện hoặc khách hàng tự gửi</p>
              </div>
              <select
                value={ticketFilterStatus}
                onChange={(e) => setTicketFilterStatus(e.target.value)}
                className="h-9 px-3 rounded-lg border border-border bg-card text-foreground text-xs focus:outline-none cursor-pointer"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="open">Mới nhận (Open)</option>
                <option value="in_progress">Đang xử lý (In Progress)</option>
                <option value="resolved">Đã giải quyết (Resolved)</option>
              </select>
            </div>

            {/* Grid 2 cột: Bảng danh sách & Khung Live Chat */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* Cột bên trái: Danh sách Tickets */}
              <div className="lg:col-span-2 rounded-2xl border border-border overflow-hidden overflow-x-auto bg-card/10">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="text-left font-semibold px-4 py-3">Khách hàng</th>
                      <th className="text-left font-semibold px-4 py-3">Danh mục</th>
                      <th className="text-left font-semibold px-4 py-3">Rủi ro (Risk)</th>
                      <th className="text-left font-semibold px-4 py-3">Trạng thái</th>
                      <th className="text-right font-semibold px-4 py-3">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredTickets.map((t) => (
                      <tr 
                        key={t.id} 
                        onClick={() => setSelectedTicket(t)}
                        className={`hover:bg-muted/30 transition-colors cursor-pointer ${selectedTicket?.id === t.id ? 'bg-primary/5 border-l-4 border-l-primary' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="space-y-1 text-left">
                            <span className="font-semibold text-foreground block truncate max-w-[160px]">
                              {(() => {
                                const matched = users.find(u => u.id === t.customer_id);
                                return matched ? matched.email : 'Khách ẩn danh';
                              })()}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(t.created_at)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted border border-border capitalize">
                            {t.category === 'advisory' ? 'Tư vấn' : t.category === 'negotiation' ? 'Đàm phán giá' : t.category === 'technical' ? 'Kỹ thuật' : t.category === 'attack_flagged' ? 'Cảnh báo' : t.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            t.risk_level === 'high' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'
                          }`}>
                            {t.risk_level}
                          </span>
                        </td>
                        <td className="px-4 py-3">{getTicketStatusBadge(t.status)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicket(t);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold transition-all cursor-pointer"
                          >
                            Xử lý
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredTickets.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">Chưa có ticket hỗ trợ nào.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cột bên phải: KHUNG CHAT TO TRỰC TIẾP (Ticket Chat Panel) */}
              <div className="lg:col-span-1 rounded-2xl border border-border bg-card/40 p-4 shadow-sm flex flex-col h-[520px] overflow-hidden">
                {selectedTicket ? (
                  <div className="flex flex-col h-full overflow-hidden">
                    {/* Header Chat Panel */}
                    <div className="border-b border-border pb-3 mb-3 flex items-center justify-between flex-shrink-0">
                      <div className="text-left">
                        <h4 className="font-extrabold text-sm text-foreground line-clamp-1">Mã: #{selectedTicket.id.substring(0, 8)}...</h4>
                        <span className="text-[10px] text-muted-foreground block truncate max-w-[180px]">
                          {(() => {
                            const matched = users.find(u => u.id === selectedTicket.customer_id);
                            return matched ? matched.email : 'Khách ẩn danh';
                          })()}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        {getTicketStatusBadge(selectedTicket.status)}
                      </div>
                    </div>

                    {/* Khung tin nhắn chat cuộn */}
                    <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin flex flex-col p-1">
                      {(() => {
                        let ticketMessages = [];
                        try {
                          const parsed = JSON.parse(selectedTicket.note);
                          if (Array.isArray(parsed)) ticketMessages = parsed;
                        } catch (e) {
                          ticketMessages = [{ role: 'customer', message: selectedTicket.note, created_at: selectedTicket.created_at }];
                        }

                        return ticketMessages.map((msg: any, idx: number) => (
                          <div
                            key={idx}
                            className={`flex ${msg.role === 'staff' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className="flex flex-col space-y-0.5 max-w-[85%]">
                              <span className={`text-[8px] text-muted-foreground block ${msg.role === 'staff' ? 'text-right' : 'text-left'}`}>
                                {msg.role === 'staff' ? 'Nhân viên (Bạn)' : 'Khách hàng'}
                              </span>
                              
                              <div
                                className={`rounded-xl p-2.5 leading-relaxed text-xs shadow-sm ${
                                  msg.role === 'staff'
                                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                                    : 'bg-card border border-border text-foreground rounded-tl-none'
                                }`}
                              >
                                {msg.message && <p className="whitespace-pre-wrap">{msg.message}</p>}
                                
                                {/* HIỂN THỊ ẢNH ĐÍNH KÈM NẾU CÓ */}
                                {msg.image_url && (
                                  <div className="mt-1.5 max-w-[200px] overflow-hidden rounded-lg border border-border">
                                    <img 
                                      src={msg.image_url} 
                                      alt="đính kèm" 
                                      className="w-full h-auto object-cover cursor-pointer hover:scale-105 transition-all"
                                      onClick={() => window.open(msg.image_url, '_blank')}
                                    />
                                  </div>
                                )}
                              </div>
                              <span className={`text-[7px] text-muted-foreground/80 block ${msg.role === 'staff' ? 'text-right' : 'text-left'}`}>
                                {formatDate(msg.created_at)}
                              </span>
                            </div>
                          </div>
                        ));
                      })()}
                      <div ref={adminChatEndRef} />
                    </div>

                    {/* Ô nhập chat kèm đính kèm ảnh */}
                    {selectedTicket.status !== 'resolved' ? (
                      <form onSubmit={handleSendTicketReply} className="pt-3 border-t border-border/60 flex flex-col gap-2 flex-shrink-0">
                        {/* Ảnh preview trước khi gửi */}
                        {pendingImage && (
                          <div className="relative w-16 h-16 rounded-lg border border-border overflow-hidden bg-muted self-start flex-shrink-0 group">
                            <img src={pendingImage} alt="preview" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setPendingImage(null)}
                              className="absolute top-0 right-0 p-0.5 bg-black/60 rounded-bl-lg text-white hover:text-destructive transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="flex gap-1.5 items-center">
                          {/* Nút upload ảnh */}
                          <label className="p-2.5 rounded-xl border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-all flex-shrink-0">
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
                            value={ticketReplyNote}
                            onChange={(e) => setTicketReplyNote(e.target.value)}
                            placeholder="Gõ phản hồi gửi trực tiếp cho khách..."
                            className="flex-1 h-9 px-3 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                          />
                          <button
                            type="submit"
                            disabled={(!ticketReplyNote.trim() && !pendingImage) || updatingTicket}
                            className="px-3.5 h-9 rounded-xl bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex-shrink-0"
                          >
                            Gửi
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={updatingTicket}
                          onClick={() => handleUpdateTicket(selectedTicket.id, 'resolved')}
                          className="w-full py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 hover:bg-emerald-600 hover:text-white text-emerald-600 border border-emerald-500/20 cursor-pointer transition-all text-center mt-1"
                        >
                          Giải quyết xong & Đóng Ticket
                        </button>
                      </form>
                    ) : (
                      <div className="p-2.5 bg-emerald-500/5 text-emerald-600 rounded-xl border border-emerald-500/15 text-[10px] font-bold text-center mt-2 flex-shrink-0">
                        ✓ Ticket này đã hoàn thành giải quyết và đóng lại.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground space-y-2">
                    <MessageSquare className="w-10 h-10 opacity-30 text-primary animate-pulse" />
                    <div className="space-y-1">
                      <h5 className="font-extrabold text-xs text-foreground">Chưa chọn Ticket xử lý</h5>
                      <p className="text-[10px] max-w-[180px] leading-relaxed">Chọn bất kỳ yêu cầu nào ở bảng bên trái để bắt đầu chat Live trực tiếp với khách hàng.</p>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </main>

      {/* ========================================================= */}
      {/* REACT CONFIRMATION MODAL: XÁC NHẬN ĐỔI VAI TRÒ (ROLE) */}
      {/* ========================================================= */}
      {roleConfirmOpen && pendingRoleChange && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border w-full max-w-sm rounded-2xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-amber-500">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="text-sm font-bold text-foreground">Xác nhận thay đổi vai trò?</h3>
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              Bạn có chắc chắn muốn thay đổi vai trò của tài khoản này thành{' '}
              <strong className="text-foreground">
                {pendingRoleChange.newRole === 'admin' ? 'Quản trị viên' : pendingRoleChange.newRole === 'staff' ? 'Nhân viên' : 'Khách hàng'}
              </strong>{' '}
              không? Thao tác này sẽ trực tiếp thay đổi quyền hạn truy cập của họ.
            </p>
            
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRoleConfirmOpen(false);
                  setPendingRoleChange(null);
                }}
                className="flex-1 h-9 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs font-semibold cursor-pointer transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { userId, newRole } = pendingRoleChange;
                  setRoleConfirmOpen(false);
                  setPendingRoleChange(null);
                  await handleUpdateUserRole(userId, newRole);
                }}
                className="flex-1 h-9 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold shadow-md shadow-primary/15 cursor-pointer active:scale-95 transition-all"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: XEM CHI TIẾT ĐƠN HÀNG (ADMIN XỬ LÝ TRẠNG THÁI) [VÔ HIỆU HÓA] */}
      {/* ========================================================= */}
      {false && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setSelectedOrder(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
              <h2 className="text-lg font-bold text-foreground">Chi tiết đơn hàng #{selectedOrder.id.substring(0, 8)}...</h2>
              <button onClick={() => setSelectedOrder(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-sm">
              {/* Thông tin vận chuyển */}
              <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border">
                <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span>Thông tin giao hàng</span>
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{selectedOrder.shipping_address}</p>
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">Đặt lúc: {formatDate(selectedOrder.created_at)}</span>
                </div>
              </div>

              {/* Thay đổi trạng thái đơn */}
              <div className="space-y-2 border-t border-border pt-4">
                <label className="text-xs font-bold text-muted-foreground block">Thay đổi trạng thái giao hàng:</label>
                <div className="flex flex-wrap gap-2">
                  {['pending', 'processing', 'shipping', 'delivered', 'cancelled'].map((st) => (
                    <button
                      key={st}
                      disabled={updatingOrderStatus}
                      onClick={() => handleUpdateOrderStatus(selectedOrder.id, st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                        selectedOrder.status === st 
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20' 
                          : 'bg-background hover:bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {st === 'pending' && 'Chờ xử lý'}
                      {st === 'processing' && 'Duyệt / Chuẩn bị'}
                      {st === 'shipping' && 'Bắt đầu giao'}
                      {st === 'delivered' && 'Hoàn thành'}
                      {st === 'cancelled' && 'Hủy đơn'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Danh sách sản phẩm */}
              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="font-bold text-foreground text-sm">Sản phẩm đã mua</h3>
                <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                  {selectedOrder.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex gap-4 items-center justify-between border-b border-border/40 pb-2">
                      <div className="flex gap-3 items-center">
                        <div className="w-12 h-12 rounded-lg border border-border p-1 bg-background flex-shrink-0 flex items-center justify-center">
                          <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground line-clamp-1 text-xs">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">Giá bán: {formatPrice(item.price)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">x{item.quantity}</span>
                        <p className="text-xs font-bold text-foreground">{formatPrice(item.price * item.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tổng thanh toán */}
              <div className="flex justify-between items-center border-t border-border pt-4 text-sm font-bold bg-muted/10 p-3 rounded-xl">
                <span className="text-muted-foreground">Tổng cộng toàn bộ đơn hàng:</span>
                <span className="text-base text-primary font-black">{formatPrice(selectedOrder.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* ========================================================= */}
      {/* MODAL 3: THÊM / SỬA SẢN PHẨM (DÙNG SPECS EDITOR KEY-VALUE) */}
      {/* ========================================================= */}
      {false && modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-lg font-bold text-foreground">{editingProduct ? 'Sửa thông tin sản phẩm' : 'Thêm sản phẩm mới'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-5 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Tên sản phẩm</label>
                <input
                  required
                  value={formProduct.name}
                  onChange={(e) => setFormProduct({ ...formProduct, name: e.target.value })}
                  placeholder="Ví dụ: iPhone 15 Pro Max 256GB"
                  className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">Thương hiệu</label>
                  <input
                    required
                    value={formProduct.brand}
                    onChange={(e) => setFormProduct({ ...formProduct, brand: e.target.value })}
                    placeholder="Ví dụ: Apple, Samsung"
                    className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">Danh mục</label>
                  <select
                    value={formProduct.category}
                    onChange={(e) => setFormProduct({ ...formProduct, category: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary cursor-pointer transition-colors"
                  >
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">Giá niêm yết (VNĐ)</label>
                  <input
                    type="number"
                    required
                    value={formProduct.price}
                    onChange={(e) => setFormProduct({ ...formProduct, price: Number(e.target.value) })}
                    placeholder="Nhập giá VNĐ..."
                    className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">Tồn kho</label>
                  <input
                    type="number"
                    required
                    value={formProduct.stock}
                    onChange={(e) => setFormProduct({ ...formProduct, stock: Number(e.target.value) })}
                    placeholder="Nhập số lượng..."
                    className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              {/* GIẢM GIÁ (MODAL FORM) */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-black text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    🏷️ Giảm giá sản phẩm
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={discountEnabled}
                      onChange={(e) => {
                        setDiscountEnabled(e.target.checked);
                        if (e.target.checked) {
                          if ((formProduct.discount || 0) === 0) {
                            setFormProduct(prev => ({ ...prev, discount: 10 }));
                            setDiscountInputStr('10');
                          } else {
                            setDiscountInputStr(String(formProduct.discount));
                          }
                        } else {
                          setDiscountInputStr('');
                        }
                      }}
                      className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                    />
                    Bật giảm giá
                  </label>
                </div>
                {discountEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">% Giảm (0–100)</label>
                      <input
                        type="text"
                        value={discountInputStr}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          const normalized = valStr.replace(',', '.');
                          if (normalized === '' || /^[0-9]*\.?[0-9]*$/.test(normalized)) {
                            setDiscountInputStr(normalized);
                            if (normalized === '' || normalized === '.') {
                              setFormProduct(prev => ({ ...prev, discount: 0 }));
                            } else {
                              const num = parseFloat(normalized);
                              if (!isNaN(num)) {
                                const clamped = Math.min(100, Math.max(0, num));
                                setFormProduct(prev => ({ ...prev, discount: clamped }));
                              }
                            }
                          }
                        }}
                        placeholder="Ví dụ: 5.7"
                        className="w-full h-11 px-4 rounded-xl border border-amber-500/40 bg-background text-foreground text-sm focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Giá sau giảm (tự tính)</label>
                      <input
                        type="text"
                        readOnly
                        value={discountEnabled && (formProduct.discount || 0) > 0 && formProduct.price > 0
                          ? Math.round(formProduct.price * (1 - (formProduct.discount || 0) / 100)).toLocaleString('vi-VN') + ' đ'
                          : '—'}
                        className="w-full h-11 px-4 rounded-xl border border-border bg-muted text-muted-foreground text-sm cursor-not-allowed"
                      />
                    </div>
                  </div>
                )}
                {discountEnabled && (formProduct.discount || 0) > 0 && formProduct.price > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                    → Giá bán: <strong>{Math.round(formProduct.price * (1 - (formProduct.discount || 0) / 100)).toLocaleString('vi-VN')}đ</strong>
                    &nbsp;← Gốc niêm yết: <span className="line-through text-muted-foreground">{formProduct.price.toLocaleString('vi-VN')}đ</span>
                    &nbsp;<span className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[10px] font-black">-{formProduct.discount}%</span>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Địa chỉ URL ảnh</label>
                <input
                  required
                  value={formProduct.images?.[0] || ''}
                  onChange={(e) => setFormProduct({ ...formProduct, images: [e.target.value] })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full h-11 px-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">Mô tả sản phẩm</label>
                <textarea
                  rows={3}
                  value={formProduct.description}
                  onChange={(e) => setFormProduct({ ...formProduct, description: e.target.value })}
                  placeholder="Nhập mô tả sản phẩm..."
                  className="w-full p-4 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:border-primary resize-none transition-colors"
                />
              </div>



              {/* SECTION: QUẢN LÝ CẤU HÌNH BIẾN THỂ (VARIANTS) */}
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-muted-foreground">⚙️ Cấu hình / Phiên bản (Variants)</label>
                  <button
                    type="button"
                    onClick={addVariantRow}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm cấu hình</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">Ví dụ: 6GB RAM / 128GB — giá tương ứng sẽ hiển thị khi khách chọn cấu hình đó.</p>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {variantRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 italic text-center">Chưa có cấu hình nào. Bấm thêm để điền.</p>
                  ) : (
                    variantRows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-5 gap-1.5 items-center">
                        <input
                          type="text"
                          placeholder="Nhãn (vd: 6GB+128GB)"
                          value={row.label}
                          onChange={(e) => updateVariantRow(idx, 'label', e.target.value)}
                          className="col-span-2 h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                        />
                        <input
                          type="number"
                          placeholder="Giá (VNĐ)"
                          value={row.price}
                          onChange={(e) => updateVariantRow(idx, 'price', e.target.value)}
                          className="h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                        />
                        <input
                          type="text"
                          placeholder="RAM (vd: 6GB)"
                          value={row.ram}
                          onChange={(e) => updateVariantRow(idx, 'ram', e.target.value)}
                          className="h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                        />
                        <div className="flex gap-1">
                          <input
                            type="text"
                            placeholder="Storage"
                            value={row.storage}
                            onChange={(e) => updateVariantRow(idx, 'storage', e.target.value)}
                            className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                          />
                          <button
                            type="button"
                            onClick={() => removeVariantRow(idx)}
                            className="p-2 rounded-lg border border-border hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* SECTION: QUẢN LÝ MÀU SẮC */}
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-muted-foreground">🎨 Màu sắc sản phẩm</label>
                  <button
                    type="button"
                    onClick={addColorRow}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm màu</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">Mỗi màu sắc có thể có ảnh riêng. Khi khách chọn màu, ảnh chính sẽ đổi sang ảnh màu đó.</p>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {colorRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 italic text-center">Chưa có màu sắc nào. Bấm thêm để điền.</p>
                  ) : (
                    colorRows.map((row, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Tên màu (vd: Đen, Đỏ Cuồng Nhiệt)"
                          value={row.name}
                          onChange={(e) => updateColorRow(idx, 'name', e.target.value)}
                          className="w-36 h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                        />
                        <input
                          type="text"
                          placeholder="URL ảnh của màu này..."
                          value={row.image}
                          onChange={(e) => updateColorRow(idx, 'image', e.target.value)}
                          className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => removeColorRow(idx)}
                          className="p-2 rounded-lg border border-border hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* SPECS EDITOR (KEY-VALUE ĐỘNG) */}
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-muted-foreground">Thông số kỹ thuật (Specs)</label>
                  <button
                    type="button"
                    onClick={addSpecRow}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm thông số</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {specRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 italic text-center">Chưa có thông số kỹ thuật nào. Bấm thêm để điền (ví dụ: CPU, RAM...)</p>
                  ) : (
                    specRows.map((row, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Tên thông số (ví dụ: RAM)"
                          value={row.key}
                          onChange={(e) => updateSpecRow(idx, 'key', e.target.value)}
                          className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                        />
                        <input
                          type="text"
                          placeholder="Giá trị (ví dụ: 16GB)"
                          value={row.value}
                          onChange={(e) => updateSpecRow(idx, 'value', e.target.value)}
                          className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs focus:outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => removeSpecRow(idx)}
                          className="p-2 rounded-lg border border-border hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-border z-10 sticky bottom-0 bg-card">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 h-11 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-sm font-semibold transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingProduct}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-primary hover:opacity-90 disabled:opacity-50 text-primary-foreground text-sm font-bold shadow-md shadow-primary/15 active:scale-[0.98] transition-all cursor-pointer"
                >
                  {savingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{editingProduct ? 'Lưu thay đổi' : 'Thêm sản phẩm'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
