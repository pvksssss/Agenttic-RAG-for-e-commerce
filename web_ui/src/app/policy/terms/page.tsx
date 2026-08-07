'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { HelpCircle, ArrowLeft, ShieldAlert, FileText, Scale, Lock, RefreshCw, UserCheck } from 'lucide-react';

interface TermSection {
  id: string;
  title: string;
  icon: any;
  content: React.ReactNode;
}

export default function TermsOfUsePage() {
  const [activeSectionId, setActiveSectionId] = useState<string>('intro');

  const sections: TermSection[] = [
    {
      id: 'intro',
      title: 'Giới thiệu chung',
      icon: FileText,
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
            Điều khoản và điều kiện sử dụng dịch vụ
          </p>
          <p>
            Chào mừng bạn đến với sàn thương mại điện tử công nghệ <strong className="text-white">4Customer</strong>. Trang web này được vận hành và cung cấp các dịch vụ mua bán thiết bị số cao cấp đến người tiêu dùng.
          </p>
          <p>
            Bằng cách truy cập, đăng ký tài khoản, hoặc tiến hành mua hàng trên hệ thống của chúng tôi, bạn được mặc định là đã đọc, hiểu và đồng ý hoàn toàn với các điều khoản sử dụng này. Nếu bạn không đồng ý với bất kỳ phần nào của các quy định dưới đây, vui lòng dừng sử dụng trang web ngay lập tức.
          </p>
          <p>
            Chúng tôi giữ quyền thay đổi, chỉnh sửa, thêm hoặc bớt các điều khoản sử dụng này vào bất kỳ lúc nào mà không cần thông báo trước. Các thay đổi sẽ có hiệu lực ngay khi được đăng tải lên website. Việc bạn tiếp tục sử dụng website sau khi các cập nhật được công bố thể hiện sự đồng ý của bạn với những thay đổi đó.
          </p>
        </div>
      )
    },
    {
      id: 'account',
      title: '1. Quy định về tài khoản & bảo mật',
      icon: UserCheck,
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
            Tạo tài khoản và trách nhiệm bảo mật thông tin
          </p>
          <ul className="list-decimal pl-5 space-y-2.5">
            <li>
              <strong className="text-white">Thông tin đăng ký chính xác:</strong> Khi đăng ký tài khoản thành viên, quý khách phải cung cấp đầy đủ thông tin cá nhân chính xác, bao gồm Họ tên, Số điện thoại và Email. Mọi thiệt hại phát sinh do thông tin cung cấp sai lệch (ví dụ: giao hàng sai địa chỉ, không thể liên hệ bảo hành) sẽ do khách hàng tự chịu trách nhiệm.
            </li>
            <li>
              <strong className="text-white">Bảo mật mật khẩu:</strong> Thành viên chịu trách nhiệm hoàn toàn về việc bảo mật mật khẩu tài khoản cá nhân. Không chia sẻ thông tin tài khoản cho bất kỳ bên thứ ba nào.
            </li>
            <li>
              <strong className="text-white">Hành vi lạm dụng:</strong> Nghiêm cấm hành vi sử dụng tài khoản ảo hoặc tạo nhiều tài khoản ảo khác nhau nhằm mục đích spam đơn hàng, lừa đảo khuyến mại, trục lợi chính sách giá hoặc gây nghẽn hệ thống.
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'transactions',
      title: '2. Chính sách mua hàng & giao dịch',
      icon: RefreshCw,
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
            Xác nhận đơn hàng và điều khoản thanh toán
          </p>
          <ul className="list-decimal pl-5 space-y-2.5">
            <li>
              <strong className="text-white">Xác nhận đơn đặt hàng:</strong> Sau khi quý khách nhấn nút thanh toán đặt hàng trên web, hệ thống sẽ tiếp nhận đơn hàng. Đơn hàng chỉ được coi là thành công khi nhân viên 4Customer gọi điện/gửi email xác nhận giao dịch.
            </li>
            <li>
              <strong className="text-white">Chính sách giá cả:</strong> Giá hiển thị trên trang web là giá bán cuối cùng (đã bao gồm VAT). Tuy nhiên, trong một số trường hợp hiếm gặp xảy ra lỗi hệ thống hiển thị sai giá (giá quá thấp so với thực tế), chúng tôi có quyền hủy bỏ đơn hàng đó và hoàn lại toàn bộ số tiền khách đã thanh toán.
            </li>
            <li>
              <strong className="text-white">Thanh toán an toàn:</strong> 4Customer hỗ trợ nhiều hình thức thanh toán gồm COD (Thanh toán khi nhận hàng), Chuyển khoản ngân hàng trực tuyến và Cổng thanh toán thẻ quốc tế qua Stripe an toàn, bảo mật tuyệt đối.
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'privacy',
      title: '3. Bảo mật thông tin cá nhân',
      icon: Lock,
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
            Chính sách bảo mật quyền riêng tư của khách hàng
          </p>
          <p>
            Chúng tôi cam kết bảo vệ thông tin cá nhân của bạn một cách tốt nhất theo Luật bảo vệ thông tin cá nhân của Việt Nam.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-slate-300">
            <li>Thông tin khách hàng chỉ được sử dụng cho việc xác nhận đơn hàng, giao hàng, hỗ trợ dịch vụ bảo hành và gửi các thông tin ưu đãi đặc quyền (nếu khách đồng ý nhận email marketing).</li>
            <li>Chúng tôi tuyệt đối không bán, trao đổi hoặc chia sẻ thông tin cá nhân của bạn cho bên thứ ba nào vì mục đích quảng cáo thương mại ngoài việc phục vụ vận chuyển đơn hàng (gửi thông tin cho bên giao hàng Logistics).</li>
            <li>Toàn bộ thông tin nhạy cảm như thẻ ngân hàng, thanh toán trực tuyến được bảo mật mã hóa thông qua chuẩn bảo mật SSL cao cấp trên máy chủ Stripe, không lưu giữ trực tiếp trên cơ sở dữ liệu của chúng tôi.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'liability',
      title: '4. Giới hạn trách nhiệm pháp lý',
      icon: Scale,
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
            Giới hạn trách nhiệm bồi thường và rủi ro phần mềm
          </p>
          <ul className="list-decimal pl-5 space-y-2.5">
            <li>
              Chúng tôi nỗ lực tối đa để website luôn hoạt động ổn định và an toàn. Tuy nhiên, chúng tôi không chịu trách nhiệm đối với các rủi ro kỹ thuật nằm ngoài tầm kiểm soát như: nghẽn mạng internet diện rộng, bị hacker tấn công DDoS phá hoại dữ liệu, hoặc sự cố phần cứng máy chủ đám mây Cloud Hosting.
            </li>
            <li>
              Quý khách có trách nhiệm sao lưu toàn bộ dữ liệu cá nhân bên trong thiết bị (điện thoại, laptop) trước khi gửi máy đến trung tâm bảo hành của 4Customer. Chúng tôi không chịu bất cứ trách nhiệm nào về việc mất mát dữ liệu lưu giữ trong thiết bị trong quá trình sửa chữa hoặc bảo hành.
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'disputes',
      title: '5. Giải quyết tranh chấp',
      icon: ShieldAlert,
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">
          <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
            Giải quyết khiếu nại và luật áp dụng
          </p>
          <p>
            Mọi tranh chấp phát sinh từ hoặc liên quan đến việc sử dụng trang web này hoặc hợp đồng mua bán sản phẩm tại 4Customer trước tiên sẽ được giải quyết thông qua thương lượng hòa giải giữa hai bên nhằm đảm bảo quyền lợi tốt nhất cho khách hàng.
          </p>
          <p>
            Trong trường hợp không thể thỏa thuận đạt được tiếng nói chung, tranh chấp sẽ được đưa ra giải quyết tại Tòa án nhân dân có thẩm quyền tại Thành phố Hồ Chí Minh theo các quy định của Pháp luật nước Cộng hòa Xã hội Chủ nghĩa Việt Nam hiện hành.
          </p>
        </div>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors duration-200">
      
      {/* Header điều hướng */}
      <header className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/account" className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại trang cá nhân</span>
          </Link>
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            <span className="text-sm font-extrabold uppercase tracking-wider">Điều khoản sử dụng 4Customer</span>
          </div>
          <div className="w-20" /> {/* Giữ cân bằng */}
        </div>
      </header>

      {/* Main Container */}
      <main className="container mx-auto px-4 py-8 flex-1 max-w-6xl">
        <h1 className="text-2xl sm:text-3xl font-black text-center text-foreground mb-8">
          ĐIỀU KHOẢN & ĐIỀU KIỆN SỬ DỤNG
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* SIDEBAR BÊN TRÁI (DANH MỤC ĐIỀU KHOẢN) */}
          <aside className="md:col-span-4 bg-card/35 rounded-2xl border border-border p-4 space-y-1">
            {sections.map(section => {
              const isSelected = activeSectionId === section.id;
              const Icon = section.icon;

              return (
                <div
                  key={section.id}
                  onClick={() => setActiveSectionId(section.id)}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-primary/10 border-primary/35 text-primary font-black shadow-md shadow-primary/5'
                      : 'border-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-extrabold">{section.title}</span>
                </div>
              );
            })}
          </aside>

          {/* CHI TIẾT ĐIỀU KHOẢN BÊN PHẢI */}
          <section className="md:col-span-8 bg-card/45 rounded-2xl border border-border p-6 shadow-sm min-h-[350px]">
            {sections.find(s => s.id === activeSectionId)?.content}
          </section>

        </div>
      </main>

      {/* Footer bản quyền */}
      <footer className="border-t border-border py-6 bg-card/20 text-center text-xs text-muted-foreground mt-12">
        <p>© 2026 4Customer. Bảo lưu mọi quyền.</p>
      </footer>
    </div>
  );
}
