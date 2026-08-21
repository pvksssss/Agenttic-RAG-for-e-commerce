import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase Admin Client dùng Service Role Key (bypass RLS) để admin xem được toàn bộ đơn hàng
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Kiểm tra quyền Admin của request dựa trên Token gửi lên từ client
async function verifyAdminRequest(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Không tìm thấy mã xác thực Authorization Header' };
  }

  const token = authHeader.split(' ')[1];

  const tempClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    auth: {
      persistSession: false
    }
  });

  const { data: { user }, error } = await tempClient.auth.getUser(token);

  if (error || !user) {
    return { error: 'Token không hợp lệ hoặc phiên đăng nhập đã hết hạn!' };
  }

  const userRole = user.user_metadata?.role;
  const isUserAdmin = userRole === 'admin' || user.email === 'admin@gmail.com' || user.email === 'vugiakhai2004@gmail.com' || user.email?.toLowerCase().includes('admin');

  if (!isUserAdmin) {
    return { error: 'Bạn không có quyền quản trị để thực hiện hành động này!' };
  }

  return { user };
}

// 1. GET API: Lấy toàn bộ đơn hàng trong hệ thống (bypass RLS)
export async function GET(request: Request) {
  try {
    const { error: authError } = await verifyAdminRequest(request);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ orders });
  } catch (error: any) {
    console.error('Lỗi khi lấy danh sách đơn hàng:', error);
    return NextResponse.json(
      { error: error.message || 'Lỗi hệ thống khi tải danh sách đơn hàng' },
      { status: 500 }
    );
  }
}

// 2. PUT API: Cập nhật trạng thái một đơn hàng
export async function PUT(request: Request) {
  try {
    const { error: authError } = await verifyAdminRequest(request);
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, status } = body;

    if (!orderId || !status) {
      return NextResponse.json({ error: 'Thiếu orderId hoặc status cần cập nhật' }, { status: 400 });
    }

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    console.error('Lỗi khi cập nhật đơn hàng:', error);
    return NextResponse.json(
      { error: error.message || 'Lỗi hệ thống khi cập nhật đơn hàng' },
      { status: 500 }
    );
  }
}
