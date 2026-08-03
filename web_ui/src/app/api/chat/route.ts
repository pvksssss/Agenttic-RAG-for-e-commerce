import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, session_id, user_token } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Tin nhắn không được để trống' },
        { status: 400 }
      );
    }

    // 1. Cố gắng kết nối tới FastAPI Backend AI Service
    // Đọc URL của RAG service từ biến môi trường (Ví dụ: NEXT_PUBLIC_RAG_SERVICE_URL trong .env.local)
    // Hoặc sử dụng fallback localhost của FastAPI (mặc định cổng 8000)
    let ragServiceUrl = process.env.NEXT_PUBLIC_RAG_SERVICE_URL || 'http://localhost:8080/chat';

    // Nếu biến môi trường trỏ đến chính nó (mock route), ta đổi sang FastAPI cổng 8080 để tránh loop vô tận
    if (ragServiceUrl.includes('/api/chat')) {
      ragServiceUrl = 'http://localhost:8080/chat';
    }

    try {
      console.log(`[Next.js API Proxy] Đang chuyển tiếp tin nhắn tới AI Backend: ${ragServiceUrl}`);
      const apiResponse = await fetch(ragServiceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user_token ? { 'Authorization': `Bearer ${user_token}` } : {})
        },
        body: JSON.stringify({
          message,
          session_id,
          user_token,
        }),
        // Timeout dài để đủ thời gian cho Workflow 1 gọi LLM + tools (có thể 15-40s)
        signal: AbortSignal.timeout(120000)
      });

      if (apiResponse.ok) {
        const data = await apiResponse.json();
        console.log('[Next.js API Proxy] Nhận phản hồi thành công từ AI Backend');
        return NextResponse.json(data);
      } else {
        console.error(`[Next.js API Proxy] AI Backend báo lỗi: ${apiResponse.status} ${apiResponse.statusText}`);
      }
    } catch (fetchError) {
      console.warn('[Next.js API Proxy] Không thể kết nối tới FastAPI Backend. Đang chuyển sang chế độ Mock Fallback.');
    }

    // 2. Chế độ Mock Fallback (chỉ chạy khi FastAPI chưa bật hoặc lỗi)
    const msgLower = message.toLowerCase();
    let reply = '';
    let tool_used = '';
    let sources: string[] = [];

    // Giả lập logic định tuyến tool của Agent
    if (msgLower.includes('laptop') || msgLower.includes('macbook') || msgLower.includes('dell') || msgLower.includes('asus')) {
      tool_used = 'product_search_tool';
      reply = `Chào bạn! Tôi tìm thấy một số sản phẩm **Laptop** nổi bật tại hệ thống của chúng tôi đáp ứng nhu cầu của bạn (Chế độ Mock Fallback):

1. **[MacBook Air M3 13 inch](/products/laptop-m3-air)**
   * **Giá**: 27,990,000 VNĐ
   * **Thông số**: Chip M3, RAM 8GB, SSD 256GB, Trọng lượng 1.24kg.
   * *Đánh giá*: Phù hợp cho dân văn phòng và học sinh sinh viên cần mỏng nhẹ, pin 18 tiếng.

2. **[Dell XPS 13 Plus 9320](/products/dell-xps-13)**
   * **Giá**: 42,500,000 VNĐ
   * **Thông số**: Intel Core i7-1360P, RAM 16GB, SSD 512GB, màn hình cảm ứng FHD+.
   * *Đánh giá*: Laptop Windows cao cấp, thiết kế tối giản sang trọng.

Bạn có thể bấm trực tiếp vào liên kết sản phẩm phía trên để xem chi tiết thông số kỹ thuật, hình ảnh và đánh giá từ khách hàng khác!`;
      sources = ['products_table_search'];
    }
    else if (msgLower.includes('so sánh') || msgLower.includes('khác nhau')) {
      tool_used = 'product_compare_tool';
      reply = `Dưới đây là bảng so sánh nhanh thông số kỹ thuật giữa **MacBook Air M3** và **Dell XPS 13 Plus** để bạn tham khảo (Chế độ Mock Fallback):

| Tiêu chí | MacBook Air M3 13" | Dell XPS 13 Plus 9320 |
| :--- | :--- | :--- |
| **Hệ điều hành** | macOS | Windows 11 Home |
| **Vi xử lý (CPU)** | Apple M3 8-Core | Intel Core i7-1360P |
| **Bộ nhớ RAM** | 8GB Unified Memory | 16GB LPDDR5 6000MHz |
| **Bộ nhớ trong** | 256GB SSD | 512GB SSD PCIe Gen4 |
| **Thời lượng pin**| Khoảng 15 - 18 tiếng | Khoảng 8 - 10 tiếng |
| **Trọng lượng** | 1.24 kg | 1.26 kg |
| **Mức giá** | 27,990,000 VNĐ | 42,500,000 VNĐ |

*Nhận xét nhanh*: MacBook Air M3 vượt trội về thời lượng pin và tối ưu nhiệt độ, mức giá cũng dễ tiếp cận hơn. Dell XPS 13 Plus có lợi thế về dung lượng RAM và SSD lớn hơn gấp đôi, màn hình cảm ứng tiện lợi và phù hợp nếu công việc của bạn bắt buộc sử dụng Windows.`;
      sources = ['specs_jsonb_comparison'];
    }
    else if (msgLower.includes('đơn hàng') || msgLower.includes('order') || msgLower.includes('mua gì')) {
      tool_used = 'order_lookup_tool';

      if (!user_token) {
        reply = `Để tra cứu trạng thái đơn hàng của bạn, vui lòng **đăng nhập tài khoản** trước tiên. Bạn có thể đăng nhập bằng email hoặc tài khoản Google ở góc trên thanh công cụ.

Sau khi đăng nhập thành công, tôi mới được phép truy cập danh sách đơn hàng để đảm bảo tính bảo mật thông tin cá nhân của bạn.`;
      } else {
        reply = `Tôi tìm thấy một đơn hàng gần đây của bạn trong cơ sở dữ liệu (Chế độ Mock Fallback):

* **Mã đơn hàng**: \`ORD-874921-2026\`
* **Ngày đặt**: 04/07/2026 15:30 (Giờ Việt Nam)
* **Sản phẩm**: 1x *Apple AirPods Pro Gen 2 USB-C*
* **Tổng tiền**: 5,690,000 VNĐ
* **Phương thức**: Stripe Credit Card
* **Trạng thái**: 🚚 **Đang vận chuyển (Shipping)**
  * *Hành trình*: Đã xuất kho trung chuyển Hà Nội lúc 08:30 ngày hôm nay. Dự kiến giao tới địa chỉ của bạn vào ngày mai.

Bạn có thể vào trang **[Quản lý tài khoản](/account)** để xem chi tiết mã vận đơn và cập nhật trạng thái mới nhất!`;
      }
      sources = ['orders_table_lookup'];
    }
    else if (msgLower.includes('bảo hành') || msgLower.includes('warranty')) {
      tool_used = 'policy_rag_tool';
      reply = `According to **[Chính sách bảo hành](/policy/warranty)** (Chế độ Mock Fallback):

* **Thời gian bảo hành**: Laptop và Điện thoại bảo hành **12 - 24 tháng** chính hãng; Tai nghe và Đồng hồ bảo hành **12 tháng** (áp dụng cơ chế 1 đổi 1 nếu lỗi từ nhà sản xuất). Phụ kiện bảo hành từ **6 - 18 tháng**.
* **Điều kiện áp dụng**: Thiết bị phải còn trong hạn bảo hành, có tem niêm phong nguyên vẹn, số Serial/IMEI trùng khớp và không có dấu hiệu va đập rơi vỡ hoặc dính nước.
* **Thời gian xử lý**: Kiểm tra lỗi trong 24h - 48h, sửa chữa thay thế linh kiện hoặc đổi mới thiết bị trong vòng 3 - 7 ngày làm việc.

Bạn có thể truy cập trang chính sách bảo hành đầy đủ để xem chi tiết danh sách trung tâm bảo hành và các trường hợp bị từ chối bảo hành.`;
      sources = ['policy_warranty_page'];
    }
    else if (msgLower.includes('đổi trả') || msgLower.includes('hoàn tiền') || msgLower.includes('trả hàng')) {
      tool_used = 'policy_rag_tool';
      reply = `According to **[Chính sách đổi trả và hoàn tiền](/policy/return)** (Chế độ Mock Fallback):

* **Đổi mới 1 đổi 1**: Áp dụng miễn phí trong vòng **30 ngày** (Laptop, Điện thoại) hoặc **15 ngày** (Đồng hồ, Tai nghe) nếu có lỗi kỹ thuật từ nhà sản xuất.
* **Đổi trả theo nhu cầu (không lỗi)**: Hỗ trợ trả lại máy trong vòng 7 ngày đầu, thu phí khấu hao **10%** giá trị hóa đơn (sản phẩm phải còn nguyên seal hộp, không áp dụng cho phụ kiện dưới 500k). Từ ngày 8 đến ngày 15 thu phí **20%**.
* **Thời gian hoàn tiền**: Chuyển khoản ngân hàng nhận lại tiền sau **3 - 5 ngày làm việc**, hoàn qua thẻ tín dụng sau **5 - 10 ngày làm việc** tùy ngân hàng.

Vui lòng giữ lại đầy đủ hộp, phụ kiện đi kèm và hóa đơn mua hàng để làm thủ tục đổi trả nhanh nhất.`;
      sources = ['policy_return_page'];
    }
    else if (msgLower.includes('vận chuyển') || msgLower.includes('giao hàng') || msgLower.includes('ship')) {
      tool_used = 'policy_rag_tool';
      reply = `According to **[Chính sách vận chuyển](/policy/shipping)** (Chế độ Mock Fallback):

* **Cước phí giao hàng**: 
  * **Miễn phí vận chuyển toàn quốc** cho các đơn hàng từ **1.000.000 VNĐ** trở lên.
  * Đồng giá **30.000 VNĐ** cho đơn hàng dưới 1.000.000 VNĐ.
  * Đồng giá **50.000 VNĐ** cho dịch vụ giao hàng **Hỏa tốc 2 giờ** (chỉ áp dụng nội thành Hà Nội & TP.HCM).
* **Thời gian nhận hàng**: Giao hỏa tốc nhận trong 2h, giao thường nội thành mất 1 - 2 ngày, liên tỉnh mất 3 - 5 ngày làm việc.
* **Đồng kiểm**: Bạn được phép mở gói hàng kiểm tra ngoại quan sản phẩm trước khi ký nhận. Chúng tôi khuyến nghị bạn quay lại video khui hộp để làm bằng chứng bảo vệ quyền lợi nếu xảy ra móp méo va đập trong lúc vận chuyển.`;
      sources = ['policy_shipping_page'];
    }
    else if (msgLower.includes('giá liên hệ') || msgLower.includes('mặc cả') || msgLower.includes('giảm giá thêm') || msgLower.includes('nhân viên')) {
      tool_used = 'escalate_tool';
      reply = `Yêu cầu tư vấn chuyên sâu / mặc cả chiết khấu của bạn thuộc phạm vi thẩm quyền của nhân viên tư vấn. 

Tôi đã **tạo một ticket hỗ trợ mới** trong hệ thống và chuyển tiếp cuộc gọi của bạn đến nhân viên chăm sóc khách hàng trực tuyến. Một nhân viên sẽ phản hồi bạn trực tiếp qua cửa sổ chat này trong vòng vài phút. Cảm ơn sự kiên nhẫn của bạn!`;
      sources = ['support_tickets_creation'];
    }
    else {
      reply = `Xin chào! Tôi là trợ lý mua sắm AI của cửa hàng (Mock Fallback). Tôi có thể hỗ trợ bạn các vấn đề sau:

1. 🔍 **Tìm kiếm sản phẩm**: Nhập nhu cầu (Ví dụ: "tìm laptop mỏng nhẹ dưới 30 triệu").
2. 📊 **So sánh thông số kỹ thuật**: Nhập tên các sản phẩm muốn so sánh (Ví dụ: "so sánh iPhone 15 Pro Max và Samsung S24 Ultra").
3. 🚚 **Tra cứu đơn hàng**: Hỏi về đơn hàng của bạn (Yêu cầu đăng nhập trước).
4. 📜 **Tìm hiểu chính sách**: Hỏi về bảo hành, đổi trả, hoặc giao nhận hàng hóa.

Bạn cần tôi giúp đỡ thông tin gì hôm nay?`;
    }

    return NextResponse.json({
      reply,
      tool_used,
      sources,
      session_id: session_id || 'mock-session-id',
    });

  } catch (error) {
    console.error('Lỗi API Mock Chat:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
}

