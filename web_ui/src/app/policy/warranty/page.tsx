'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, PhoneCall, ChevronDown, ChevronUp, ArrowLeft, Building2, HelpCircle } from 'lucide-react';

interface SubItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface MainSection {
  id: string;
  title: string;
  subItems?: SubItem[];
  content?: React.ReactNode;
}

export default function WarrantyPolicyPage() {
  const [activeSectionId, setActiveSectionId] = useState<string>('iii');
  const [activeSubItemId, setActiveSubItemId] = useState<string>('iii-1');
  const [expandedSectionIds, setExpandedSectionIds] = useState<Record<string, boolean>>({
    'iii': true
  });

  const toggleSectionExpand = (sectionId: string) => {
    setExpandedSectionIds(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const selectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    const sec = sections.find(s => s.id === sectionId);
    if (sec?.subItems && sec.subItems.length > 0) {
      setActiveSubItemId(sec.subItems[0].id);
      setExpandedSectionIds(prev => ({ ...prev, [sectionId]: true }));
    } else {
      setActiveSubItemId('');
    }
  };

  const selectSubItem = (sectionId: string, subItemId: string) => {
    setActiveSectionId(sectionId);
    setActiveSubItemId(subItemId);
  };

  const sections: MainSection[] = [
    {
      id: 'i',
      title: 'I. Đổi mới 30 ngày miễn phí',
      content: (
        <div className="space-y-5 text-sm leading-relaxed">
          <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
            Chính sách đổi trả miễn phí trong 30 ngày đầu
          </p>
          <ul className="space-y-3 list-decimal pl-5">
            <li>
              <strong className="text-foreground">Sản phẩm áp dụng:</strong> Toàn bộ các thiết bị phần cứng gồm Laptop, Điện thoại di động, Máy tính bảng, Tai nghe cao cấp, Đồng hồ thông minh mua mới chính hãng tại 4Customer.
            </li>
            <li>
              <strong className="text-foreground">Thời gian áp dụng:</strong> Trong vòng 30 ngày kể từ ngày quý khách nhận hàng thành công (dựa trên hóa đơn điện tử hoặc biên nhận giao hàng).
            </li>
            <li>
              <strong className="text-foreground">Điều kiện áp dụng:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
                <li>Thiết bị phát sinh lỗi phần cứng được xác định là do nhà sản xuất (lỗi mainboard, màn hình hiển thị, linh kiện điện tử bên trong).</li>
                <li>Sản phẩm còn đầy đủ hộp (box) trùng IMEI/Serial, hóa đơn mua hàng, các phụ kiện đi kèm ban đầu (củ sạc, cáp sạc, tai nghe tặng kèm) và quà khuyến mãi (nếu có).</li>
                <li>Thiết bị không bị trầy xước nặng, không móp méo, không bể vỡ và không bị ngấm nước/chất lỏng.</li>
              </ul>
            </li>
            <li>
              <strong className="text-foreground">Quyền lợi:</strong> Quý khách được đổi ngay 01 sản phẩm mới cùng model, cùng màu sắc hoàn toàn miễn phí. Trường hợp sản phẩm đó đã hết hàng, quý khách có thể đổi sang model khác tương đương hoặc hoàn tiền 100%.
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'ii',
      title: 'II. Bảo hành tiêu chuẩn',
      content: (
        <div className="space-y-5 text-sm leading-relaxed">
          <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
            Chế độ bảo hành tiêu chuẩn từ nhà sản xuất
          </p>
          <ul className="space-y-3 list-decimal pl-5">
            <li>
              <strong className="text-foreground">Thời hạn bảo hành:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
                <li>Laptop: Bảo hành 12 - 24 tháng chính hãng hãng theo quy định của nhà sản xuất (Dell, HP, Asus, Lenovo, Apple...).</li>
                <li>Điện thoại / Máy tính bảng: Bảo hành 12 tháng tại các Trung tâm bảo hành (TTBH) ủy quyền.</li>
                <li>Tai nghe, Loa, Phụ kiện GaN cao cấp: Bảo hành 12 tháng (đổi mới).</li>
              </ul>
            </li>
            <li>
              <strong className="text-foreground">Điều kiện tiếp nhận bảo hành:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
                <li>Thiết bị còn trong thời hạn bảo hành quy định.</li>
                <li>Lỗi phần cứng xảy ra trong quá trình sử dụng bình thường không có ngoại lực tác động.</li>
                <li>Tem bảo hành, tem niêm phong ốc vít phải còn nguyên vẹn, không có vết cạy mở hoặc rách nát.</li>
                <li>Mã IMEI/Serial trên khay sim, thân máy và bo mạch phải trùng khớp hoàn toàn.</li>
              </ul>
            </li>
            <li>
              <strong className="text-foreground">Các trường hợp bị từ chối:</strong>
              <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
                <li>Thiết bị bị ẩm mốc, rỉ sét, ngấm nước, chập cháy linh kiện do nguồn điện không ổn định.</li>
                <li>Thiết bị bị rơi vỡ móp méo, nứt màn hình do người dùng vô ý hoặc cố ý làm hỏng.</li>
                <li>Đã tự ý tháo dỡ sửa chữa ở những cửa hàng ngoài hệ thống ủy quyền của hãng.</li>
              </ul>
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'iii',
      title: 'III. Bảo hành mở rộng',
      subItems: [
        {
          id: 'iii-1',
          title: '1. Bảo hành 1 đổi 1 VIP',
          content: (
            <div className="space-y-4 text-xs sm:text-sm leading-relaxed">
              <div>
                <strong className="text-foreground block mb-1">1. Sản phẩm áp dụng:</strong>
                <span className="text-muted-foreground">Điện thoại, máy tính bảng mới/cũ; Tai nghe cao cấp mới, Đồng hồ thông minh Apple/Samsung mới.</span>
              </div>
              
              <div>
                <strong className="text-foreground block mb-1">2. Thời gian bảo hành:</strong>
                <span className="text-muted-foreground">06 tháng / 12 tháng tùy thuộc vào gói dịch vụ khách hàng lựa chọn mua kèm.</span>
              </div>

              <div>
                <strong className="text-foreground block mb-1">3. Điều kiện bảo hành:</strong>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground mt-1">
                  <li>Sản phẩm bị lỗi phần cứng do nhà sản xuất phát sinh trong thời gian bảo hành.</li>
                  <li>
                    Việc kiểm tra và xác định lỗi do nhà sản xuất được thực hiện bởi các Trung Tâm Bảo Hành (TTBH) sau:
                    <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-primary/40 text-xs text-foreground">
                      <div><strong className="text-primary font-extrabold">CareS</strong> - Trung tâm bảo hành ủy quyền Apple tại Việt Nam: Áp dụng đối với tất cả sản phẩm Apple mới.</div>
                      <div><strong>Trung tâm bảo hành của hãng</strong>: Áp dụng đối với các dòng sản phẩm Tivi, điện thoại và máy tính bảng chạy hệ điều hành Android.</div>
                      <div><strong>Trung tâm Bảo Hành Điện Thoại Vui</strong> - Đối tác chiến lược của 4Customer: Áp dụng đối với tất cả các dòng sản phẩm còn lại và thiết bị cũ.</div>
                    </div>
                  </li>
                </ul>
              </div>

              <div>
                <strong className="text-foreground block mb-1">4. Quyền lợi bảo hành:</strong>
                <p className="text-muted-foreground mb-2">Đổi sản phẩm sau khi sản phẩm được kiểm tra kỹ thuật và xác định đúng bị lỗi phần cứng phát sinh từ phía nhà sản xuất:</p>
                
                {/* BẢNG SO SÁNH PHẠM VI BẢO HÀNH */}
                <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-muted text-foreground border-b border-border">
                        <th className="p-3 font-extrabold">Phạm vi bảo hành</th>
                        <th className="p-3 font-extrabold">Bảo hành tiêu chuẩn</th>
                        <th className="p-3 font-extrabold text-primary">BH 1 đổi 1 - VIP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="p-3 font-semibold text-foreground">Mainboard (lỗi nguồn), ổ cứng</td>
                        <td className="p-3 text-muted-foreground">Bảo hành sửa chữa hoặc sản phẩm đổi là sản phẩm tồn kho/chưa kích hoạt/máy cũ</td>
                        <td className="p-3 text-primary font-bold">1 đổi 1</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-foreground">Màn hình cảm ứng (≥ 3 điểm chết hoặc kích thước điểm chết ≥ 1mm)</td>
                        <td className="p-3 text-muted-foreground">Bảo hành sửa chữa linh kiện</td>
                        <td className="p-3 text-primary font-bold">1 đổi 1</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-foreground">Các lỗi linh kiện: camera, loa, chip wifi, mic thoại, đèn flash...</td>
                        <td className="p-3 text-muted-foreground">Bảo hành sửa chữa linh kiện</td>
                        <td className="p-3 text-primary font-bold">1 đổi 1</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-foreground">Lỗi chân sim, chân khe cắm thẻ nhớ, chân sạc</td>
                        <td className="p-3 text-muted-foreground">Không được tiếp nhận bảo hành miễn phí</td>
                        <td className="p-3 text-primary font-bold">Bảo hành sửa chữa miễn phí</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        },
        {
          id: 'iii-2',
          title: '2. Bảo hành rơi vỡ, ngấm nước',
          content: (
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
                Gói bảo hiểm tai nạn rơi vỡ & vào nước của thiết bị
              </p>
              <ul className="space-y-2 list-disc pl-5 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Phạm vi áp dụng:</strong> Thiết bị di động (Smartphone/Tablet) và Laptop mua kèm gói dịch vụ bảo hiểm tại 4Customer.
                </li>
                <li>
                  <strong className="text-foreground">Quyền lợi sửa chữa:</strong> Hỗ trợ chi phí sửa chữa lên tới <span className="text-primary font-bold">90%</span> giá trị hóa đơn sửa chữa linh kiện khi thiết bị vô tình gặp tai nạn rơi vỡ, nứt màn hình hoặc ngấm nước/chất lỏng trong quá trình sử dụng.
                </li>
                <li>
                  <strong className="text-foreground">Quyền lợi đổi máy:</strong> Trong trường hợp máy hỏng hóc nặng không thể phục hồi hoặc chi phí sửa chữa vượt quá giá trị máy, hệ thống hỗ trợ đổi máy tương đương cùng loại (Khách hàng chỉ cần đồng chi trả 10-20% giá trị thiết bị mới).
                </li>
              </ul>
            </div>
          )
        },
        {
          id: 'iii-3',
          title: '3. Bảo hành mở rộng S24+',
          content: (
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="font-extrabold text-foreground text-base border-b border-border pb-2">
                Đặc quyền gia hạn bảo hành cho Samsung Galaxy S24 Series
              </p>
              <ul className="space-y-2 list-disc pl-5 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Sản phẩm áp dụng:</strong> Samsung Galaxy S24, S24 Plus, S24 Ultra chính hãng mua mới tại hệ thống.
                </li>
                <li>
                  <strong className="text-foreground">Quyền lợi gia hạn:</strong> Tự động kéo dài thời hạn bảo hành chính hãng từ 12 tháng tiêu chuẩn lên thành **24 tháng**.
                </li>
                <li>
                  <strong className="text-foreground">Chính sách 1 đổi 1:</strong> Độc quyền 1 đổi 1 trong vòng 30 ngày nếu phát sinh bất cứ lỗi nào từ phía nhà sản xuất.
                </li>
                <li>
                  <strong className="text-foreground">Miễn phí sửa chữa:</strong> Miễn phí toàn bộ tiền công kỹ thuật và chi phí thay thế linh kiện màn hình/mainboard chính hãng Samsung trong suốt năm thứ 2.
                </li>
              </ul>
            </div>
          )
        }
      ]
    }
  ];

  // Lấy nội dung hiển thị bên phải
  const getActiveContent = () => {
    const sec = sections.find(s => s.id === activeSectionId);
    if (!sec) return <div className="text-muted-foreground text-sm">Vui lòng chọn một danh mục bên trái</div>;

    if (sec.subItems && sec.subItems.length > 0) {
      const sub = sec.subItems.find(s => s.id === activeSubItemId);
      return sub ? sub.content : <div className="text-muted-foreground text-sm">Vui lòng chọn mục con bên trái</div>;
    }

    return sec.content;
  };

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
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="text-sm font-extrabold uppercase tracking-wider">Trung tâm bảo hành 4Customer</span>
          </div>
          <div className="w-20" /> {/* Giữ cân bằng */}
        </div>
      </header>

      {/* Main Container */}
      <main className="container mx-auto px-4 py-8 flex-1 max-w-6xl">
        <h1 className="text-2xl sm:text-3xl font-black text-center text-foreground mb-8">
          CHÍNH SÁCH BẢO HÀNH SẢN PHẨM
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* SIDEBAR BÊN TRÁI (MENU ACCORDION) */}
          <aside className="md:col-span-4 bg-card/35 rounded-2xl border border-border p-4 space-y-2">
            {sections.map(section => {
              const isSelected = activeSectionId === section.id;
              const hasSubItems = !!section.subItems && section.subItems.length > 0;
              const isExpanded = !!expandedSectionIds[section.id];

              return (
                <div key={section.id} className="space-y-1">
                  {/* Mục chính */}
                  <div
                    onClick={() => {
                      if (hasSubItems) {
                        toggleSectionExpand(section.id);
                      }
                      selectSection(section.id);
                    }}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-xl cursor-pointer transition-all border ${
                      isSelected && !hasSubItems
                        ? 'bg-primary/10 border-primary/35 text-primary font-black'
                        : isSelected && hasSubItems
                          ? 'border-primary/20 bg-muted/30 text-foreground font-black'
                          : 'border-transparent hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="text-xs sm:text-sm font-extrabold">{section.title}</span>
                    {hasSubItems && (
                      isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                    )}
                  </div>

                  {/* Danh sách mục con */}
                  {hasSubItems && isExpanded && (
                    <div className="pl-4 mt-1 border-l border-border/80 ml-4 space-y-1">
                      {section.subItems?.map(sub => {
                        const isSubSelected = activeSubItemId === sub.id;
                        return (
                          <div
                            key={sub.id}
                            onClick={() => selectSubItem(section.id, sub.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                              isSubSelected
                                ? 'text-primary bg-primary/5 font-black border-l-2 border-primary'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                            }`}
                          >
                            {sub.title}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </aside>

          {/* CHI TIẾT CHÍNH SÁCH BÊN PHẢI */}
          <section className="md:col-span-8 bg-card/45 rounded-2xl border border-border p-6 shadow-sm relative min-h-[350px] flex flex-col justify-between">
            <div className="flex-1">
              {getActiveContent()}
            </div>

            {/* Nút Liên hệ nổi ở góc dưới bên phải */}
            <div className="flex justify-end mt-6 pt-4 border-t border-border/60">
              <a
                href="tel:0987676767"
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-full shadow-lg shadow-red-600/20 transition-all cursor-pointer transform hover:scale-105 active:scale-95"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Liên hệ: 0987 67 67 67</span>
              </a>
            </div>
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
