import React from 'react';
import Link from 'next/link';
import { MapPin, Phone, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-card text-muted-foreground text-sm mt-auto transition-colors duration-200">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* CỘT 1: THƯƠNG HIỆU */}
          <div className="space-y-4">
            <h3 className="text-foreground font-bold text-lg flex items-center gap-2">
              <span className="bg-primary px-2 py-1 rounded text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">
                4C
              </span>
              4Customer
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Trang web thương mại điện tử chuyên nghiệp cung cấp các thiết bị công nghệ chính hãng hàng đầu Việt Nam. Tích hợp giải pháp AI hỗ trợ 24/7.
            </p>
          </div>

          {/* CỘT 2: HỖ TRỢ KHÁCH HÀNG */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Hỗ trợ khách hàng</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/policy/warranty" className="hover:text-foreground transition-colors">
                  Chính sách bảo hành
                </Link>
              </li>
              <li>
                <Link href="/policy/return" className="hover:text-foreground transition-colors">
                  Chính sách đổi trả &amp; hoàn tiền
                </Link>
              </li>
              <li>
                <Link href="/policy/shipping" className="hover:text-foreground transition-colors">
                  Chính sách vận chuyển &amp; đồng kiểm
                </Link>
              </li>
            </ul>
          </div>

          {/* CỘT 3: DANH MỤC SẢN PHẨM */}
          <div>
            <h4 className="text-foreground font-semibold mb-4">Danh mục sản phẩm</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/products?category=laptop" className="hover:text-foreground transition-colors">
                  Máy tính xách tay Laptop
                </Link>
              </li>
              <li>
                <Link href="/products?category=phone" className="hover:text-foreground transition-colors">
                  Điện thoại thông minh
                </Link>
              </li>
              <li>
                <Link href="/products?category=smartwatch" className="hover:text-foreground transition-colors">
                  Đồng hồ thông minh
                </Link>
              </li>
              <li>
                <Link href="/products?category=earphone" className="hover:text-foreground transition-colors">
                  Tai nghe không dây
                </Link>
              </li>
            </ul>
          </div>

          {/* CỘT 4: LIÊN HỆ */}
          <div className="space-y-2.5 text-xs">
            <h4 className="text-foreground font-semibold mb-4">Thông tin liên hệ</h4>
            <p className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary" />
              <span>123 Đường Cầu Giấy, Quận Cầu Giấy, Hà Nội</span>
            </p>
            <p className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
              <span>Hotline: 1900 6789 (8:00 - 21:00)</span>
            </p>
            <p className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
              <span>support@4customer.com</span>
            </p>
          </div>
        </div>

        {/* BẢN QUYỀN */}
        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
          <p>© {new Date().getFullYear()} 4Customer. Tất cả các quyền được bảo lưu.</p>
          <div className="flex gap-4">
            <span className="hover:text-foreground cursor-pointer transition-colors">Điều khoản dịch vụ</span>
            <span className="hover:text-foreground cursor-pointer transition-colors">Bảo mật thông tin</span>
            <Link href="/admin" className="hover:text-foreground transition-colors">Quản trị</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
