'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCart } from '@/store/useCart';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, ArrowRight, ShoppingBag, Eye } from 'lucide-react';
import Link from 'next/link';

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const statusParam = searchParams.get('status') || ''; // 'cod' hoặc null/stripe
  const sessionId = searchParams.get('session_id') || '';
  const userId = searchParams.get('user_id') || '00000000-0000-0000-0000-000000000000';
  const address = searchParams.get('address') || '';

  const clearCart = useCart((state) => state.clearCart);
  
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleOrderSuccess = async () => {
      // 1. Nếu là đơn hàng COD:
      if (statusParam === 'cod') {
        // Đơn hàng COD đã được ghi vào DB ở trang Checkout
        // Chỉ cần dọn sạch giỏ hàng và hoàn tất
        clearCart();
        setIsProcessing(false);
        return;
      }

      // 2. Nếu là đơn hàng thanh toán qua Stripe (Stripe chuyển hướng về thành công):
      if (sessionId) {
        try {
          const tempItemsRaw = localStorage.getItem('temp_checkout_items');
          if (tempItemsRaw) {
            const tempItems = JSON.parse(tempItemsRaw);
            const total = tempItems.reduce((acc: number, cur: any) => acc + cur.price * cur.quantity, 0);

            // Kiểm tra xem đơn hàng cho session này đã tồn tại chưa để tránh trùng lặp khi reload trang
            const { data: existingOrder } = await supabase
              .from('orders')
              .select('id')
              .eq('shipping_address', decodeURIComponent(address))
              .eq('total', total)
              .limit(1);

            if (existingOrder && existingOrder.length > 0) {
              setOrderId(existingOrder[0].id);
              clearCart();
              localStorage.removeItem('temp_checkout_items');
              setIsProcessing(false);
              return;
            }

            // Ghi nhận đơn hàng thành công từ Stripe vào database Supabase
            const { data: newOrder, error } = await supabase
              .from('orders')
              .insert({
                user_id: userId,
                status: 'processing', // Stripe đã nhận thanh toán thành công
                items: tempItems.map((item: any) => ({
                  id: item.id,
                  name: item.name,
                  price: item.price,
                  quantity: item.quantity,
                  image: item.image,
                })),
                total: total,
                shipping_address: decodeURIComponent(address),
              })
              .select('id')
              .single();

            if (error) {
              console.error('Lỗi khi ghi nhận đơn hàng Stripe vào DB:', error);
            } else if (newOrder) {
              setOrderId(newOrder.id);
              // Trừ tồn kho (stock) của sản phẩm
              for (const item of tempItems) {
                try {
                  const { data: prod } = await supabase.from('products').select('stock').eq('id', item.id).single();
                  if (prod) {
                    await supabase.from('products').update({ stock: Math.max(0, prod.stock - item.quantity) }).eq('id', item.id);
                  }
                } catch (stockErr) {
                  console.error(`Không thể trừ tồn kho của sản phẩm ${item.id}:`, stockErr);
                }
              }
            }
          }
        } catch (e) {
          console.error('Lỗi phân tích dữ liệu giỏ hàng tạm:', e);
        } finally {
          clearCart();
          localStorage.removeItem('temp_checkout_items');
          setIsProcessing(false);
        }
      } else {
        setIsProcessing(false);
      }
    };

    handleOrderSuccess();
  }, [statusParam, sessionId, userId, address]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  };

  return (
    <div className="container mx-auto px-4 py-16 flex-1 flex flex-col items-center justify-center gap-8 max-w-lg text-center">
      {isProcessing ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-muted-foreground">Đang xác thực và ghi nhận đơn hàng...</span>
        </div>
      ) : (
        <>
          {/* Icon Thành Công */}
          <div className="p-4 rounded-full bg-success/10 text-success animate-bounce">
            <CheckCircle2 className="w-16 h-16" />
          </div>

          {/* Tiêu đề thông báo */}
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">Đặt hàng thành công!</h1>
            <p className="text-muted-foreground text-sm">
              Cảm ơn quý khách đã tin tưởng và mua sắm tại 4Customer. Đơn hàng của bạn đã được xác nhận thành công và đang được chuẩn bị đóng gói.
            </p>
          </div>

          {/* Chi tiết đơn hàng */}
          <div className="w-full p-6 rounded-2xl border border-border bg-card text-left text-xs sm:text-sm space-y-3">
            <h3 className="font-bold text-foreground border-b border-border pb-2">Chi tiết giao hàng</h3>
            {orderId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mã đơn hàng (DB):</span>
                <span className="text-foreground font-mono font-bold truncate max-w-[200px]">{orderId}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hình thức thanh toán:</span>
              <span className="text-foreground font-semibold">
                {statusParam === 'cod' ? 'Thanh toán khi nhận hàng (COD)' : 'Thẻ tín dụng (Stripe Online)'}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground block">Địa chỉ nhận hàng:</span>
              <p className="text-foreground bg-muted p-2.5 rounded-lg border border-border text-xs leading-relaxed">
                {decodeURIComponent(address) || 'Thông tin địa chỉ chưa cập nhật'}
              </p>
            </div>
          </div>

          {/* Các nút điều hướng */}
          <div className="flex flex-col sm:flex-row gap-4 w-full pt-4">
            <Link
              href="/account"
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border border-border hover:border-muted-foreground/40 bg-card text-muted-foreground hover:text-foreground font-bold transition-all text-xs sm:text-sm"
            >
              <Eye className="w-4 h-4" />
              <span>Đơn hàng của tôi</span>
            </Link>
            <Link
              href="/products"
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-bold hover:shadow-lg hover:shadow-primary/25 active:scale-95 transition-all text-xs sm:text-sm"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Tiếp tục mua sắm</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-16 flex items-center justify-center flex-1">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Đang tải thông tin đơn hàng...</span>
        </div>
      </div>
    }>
      <CheckoutSuccessContent />
    </Suspense>
  );
}
