'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useCart } from '@/store/useCart';
import { Star, ShoppingCart, ShieldCheck, Truck, RefreshCw, ChevronLeft, Cpu, HardDrive, Layers, Gift, CreditCard, Headphones, Award } from 'lucide-react';
import Link from 'next/link';

// Danh sách các key thông số kỹ thuật thực tế được phép hiển thị (Whitelist)
const ALLOWED_SPEC_KEYS = new Set([
  // Core Specs
  'cpu', 'gpu', 'ram', 'storage', 'luu tru', 'o cung', 'o cung laptop', 'battery', 'pin', 'weight', 'trong luong', 'dimensions', 'kich thuoc', 'os', 'hdh',
  
  // Display Specs
  'display_size', 'display_resolution', 'display_type', 'man hinh', 'do phan giai', 'tan so quet', 'laptop_tan_so_quet', 'laptop_tam_nen_man_hinh', 'tam nen',
  
  // Hardware Details
  'chipset', 'vga', 'wlan', 'ports_slots', 'laptop_so_khe_ram', 'laptop_loai_ram', 'laptop_loai_den_ban_phim', 'laptop_camera_webcam', 'webcam',
  
  // Camera Specs
  'camera_primary', 'camera_secondary', 'camera_video', 'camera sau', 'camera truoc',
  
  // Connectivity
  'bluetooth', 'wifi', 'nfc', 'sim', 'network', 'charging', 'waterproof', 'fingerprint',
  
  // Others
  'laptop_bao_mat', 'laptop_special_feature', 'laptop_nganh_hoc', 'nhu_cau_su_dung', 'warranty_information', 'included_accessories',
  'laptop_bottom_case', 'laptop_top_case', 'laptop_vo_man_hinh', 'laptop_cong_nghe_am_thanh', 'material', 'sound'
]);

// Tên tiếng Việt hiển thị đẹp đẽ cho các key thông số động
const SPEC_LABELS: Record<string, string> = {
  // Các key từ description tiếng Việt
  'cpu': 'Bộ xử lý (CPU)',
  'chipset': 'Chipset (Vi xử lý)',
  'ram': 'Dung lượng RAM',
  'luu tru': 'Bộ nhớ trong (Storage)',
  'man hinh': 'Kích thước màn hình',
  'do phan giai': 'Độ phân giải màn hình',
  'pin': 'Dung lượng Pin',
  'hdh': 'Hệ điều hành',
  'camera sau': 'Camera sau',
  'camera truoc': 'Camera trước',
  'bluetooth': 'Kết nối Bluetooth',
  'kich thuoc': 'Kích thước thiết bị',
  
  // Các key từ attributes_json laptop/phone
  'laptop_cpu': 'Dòng CPU',
  'laptop_ram': 'RAM máy',
  'laptop_loai_ram': 'Loại RAM',
  'laptop_so_khe_ram': 'Số khe cắm RAM',
  'laptop_camera_webcam': 'Webcam (Camera)',
  'laptop_tan_so_quet': 'Tần số quét màn hình',
  'laptop_tam_nen_man_hinh': 'Tấm nền màn hình',
  'laptop_loai_den_ban_phim': 'Đèn bàn phím',
  'laptop_nganh_hoc': 'Phù hợp ngành học',
  'laptop_special_feature': 'Tính năng đặc biệt',
  'laptop_bao_mat': 'Công nghệ bảo mật',
  'o_cung_laptop': 'Ổ cứng lưu trữ',
  'ports_slots': 'Cổng kết nối',
  'vga': 'Card đồ họa (VGA)',
  'wlan': 'Chuẩn Wi-Fi',
  'warranty_information': 'Thời gian bảo hành',
  'included_accessories': 'Phụ kiện đi kèm',
  'product_state': 'Tình trạng sản phẩm',
  'product_weight': 'Trọng lượng sản phẩm',
  'nhu_cau_su_dung': 'Nhu cầu sử dụng',
  'laptop_bottom_case': 'Chất liệu vỏ dưới',
  'laptop_top_case': 'Chất liệu vỏ trên',
  'laptop_vo_man_hinh': 'Chất liệu viền màn hình',
  'display_resolution': 'Độ phân giải hiển thị',
  'display_size': 'Kích thước màn hình',
  'camera_primary': 'Camera chính (sau)',
  'camera_secondary': 'Camera phụ (trước)',
  'camera_video': 'Chất lượng quay video',
  'dimensions': 'Kích thước sản phẩm',
  'weight': 'Trọng lượng',
  'os': 'Hệ điều hành',
  'gpu': 'Chip đồ họa (GPU)',
  
  // Thêm các nhãn phổ biến khác
  'network': 'Mạng di động',
  'sim': 'Thẻ SIM',
  'charging': 'Công nghệ sạc',
  'waterproof': 'Chống nước',
  'nfc': 'Công nghệ NFC',
  'fingerprint': 'Bảo mật vân tay',
  'sound': 'Công nghệ âm thanh',
  'material': 'Chất liệu thiết bị'
};

function getSpecLabel(key: string): string {
  const cleanKey = key.replace(/^(laptop_|mobile_|phone_|product_)/g, '').replace(/_/g, ' ').trim().toLowerCase();
  
  // Kiểm tra mapping cụ thể
  if (SPEC_LABELS[key.toLowerCase()]) return SPEC_LABELS[key.toLowerCase()];
  if (SPEC_LABELS[cleanKey]) return SPEC_LABELS[cleanKey];
  
  // Nếu không tìm thấy, viết hoa chữ cái đầu và loại bỏ gạch dưới
  return cleanKey.replace(/\b\w/g, l => l.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT CHÍNH
// ─────────────────────────────────────────────────────────────────────────────
export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [product, setProduct] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [activeImage, setActiveImage] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);

  // Lựa chọn màu sắc
  const [selectedColor, setSelectedColor] = useState<string>('');
  // Lựa chọn cấu hình RAM/ROM
  const [selectedRamRom, setSelectedRamRom] = useState<string>('');
  // Lựa chọn Tình trạng / Phân loại hàng
  const [selectedCondition, setSelectedCondition] = useState<string>('');
  // Lựa chọn loại hàng (Edition)
  const [selectedEdition, setSelectedEdition] = useState<any>(null);
  // Lựa chọn cấu hình (variant)
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  // Giá hiển thị (cập nhật khi chọn variant)
  const [displayPrice, setDisplayPrice] = useState<number>(0);

  const addItem = useCart((state) => state.addItem);

  useEffect(() => {
    const fetchProductData = async () => {
      setIsLoading(true);
      try {
        const { data: prodData, error: prodError } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();

        if (prodError || !prodData) {
          throw new Error('Không tìm thấy sản phẩm');
        }

        // Adapter mapping cho trang chi tiết sản phẩm
        const images = prodData.images && prodData.images.length > 0 ? prodData.images : [];
        if (images.length === 0) {
          if (prodData.image_url) images.push(prodData.image_url);
          else if (prodData.thumbnail) images.push(prodData.thumbnail);
          else images.push('https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600');
        }

        const mappedProd = {
          ...prodData,
          images,
          original_price: prodData.price,
          final_price: prodData.final_price || prodData.price,
          discount: prodData.price > 0 && prodData.final_price < prodData.price
            ? Math.round(((prodData.price - prodData.final_price) / prodData.price) * 100)
            : 0,
          rating_avg: prodData.rating_avg !== undefined ? prodData.rating_avg : 4.7,
          specs: prodData.specs || {}
        };

        setProduct(mappedProd);
        setDisplayPrice(mappedProd.price);
        setActiveImage(mappedProd.images?.[0] || '');

        const dbVariants = mappedProd.specs?.variants || [];
        
        // 1. Lấy danh sách Color độc nhất
        const colorsList: string[] = [];
        dbVariants.forEach((v: any) => {
          if (v.color && !colorsList.includes(v.color)) {
            colorsList.push(v.color);
          }
        });
        const finalColors = colorsList.length > 0 ? colorsList : (prodData.specs?.color_options || []);

        // 2. Lấy danh sách RAM/ROM độc nhất
        const ramRomsList: string[] = [];
        dbVariants.forEach((v: any) => {
          const combined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
          if (combined && !ramRomsList.includes(combined)) {
            ramRomsList.push(combined);
          }
        });

        // 3. Lấy danh sách Tình trạng độc nhất
        const conditionsList: string[] = [];
        dbVariants.forEach((v: any) => {
          if (v.condition && !conditionsList.includes(v.condition)) {
            conditionsList.push(v.condition);
          }
        });

        // Chọn mặc định
        let defaultColor = finalColors.length > 0 ? finalColors[0] : '';
        let defaultRamRom = ramRomsList.length > 0 ? ramRomsList[0] : '';
        let defaultCondition = conditionsList.length > 0 ? conditionsList[0] : '';

        if (defaultColor) setSelectedColor(defaultColor);
        if (defaultRamRom) setSelectedRamRom(defaultRamRom);
        if (defaultCondition) setSelectedCondition(defaultCondition);

        // Tìm variant khớp
        if (dbVariants.length > 0) {
          const matched = dbVariants.find((v: any) => {
            const vCombined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
            const matchColor = !v.color || v.color.toLowerCase() === defaultColor.toLowerCase();
            const matchRamRom = !vCombined || vCombined === defaultRamRom;
            const matchCondition = !v.condition || v.condition.toLowerCase() === defaultCondition.toLowerCase();
            return matchColor && matchRamRom && matchCondition;
          });

          const activeVar = matched || dbVariants[0];
          setSelectedVariant(activeVar);
          setDisplayPrice(activeVar.price || prodData.price);
          if (activeVar.image) {
            setActiveImage(activeVar.image);
          }
        }

        // Tải reviews
        const { data: revData } = await supabase
          .from('reviews')
          .select('*')
          .eq('product_id', id);
        if (revData) setReviews(revData);
      } catch (err) {
        console.warn('Lỗi tải sản phẩm:', err);
        setProduct(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchProductData();
  }, [id]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);

  // Xử lý khi người dùng chọn thuộc tính Màu Sắc
  const handleSelectColor = (color: string) => {
    setSelectedColor(color);
    const dbVariants = product?.specs?.variants || [];
    const candidates = dbVariants.filter((v: any) => v.color?.toLowerCase() === color.toLowerCase());
    
    if (candidates.length > 0) {
      let matched = candidates.find((v: any) => {
        const vCombined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
        return vCombined === selectedRamRom;
      });
      if (!matched) matched = candidates[0];
      
      const vCombined = matched.ram && matched.storage ? `${matched.ram}/${matched.storage}` : (matched.ram || matched.storage || '');
      if (vCombined) setSelectedRamRom(vCombined);
      if (matched.condition) setSelectedCondition(matched.condition);
      setSelectedVariant(matched);
      setDisplayPrice(matched.price || product.price);
      if (matched.image) setActiveImage(matched.image);
    } else {
      const idx = product?.specs?.color_options?.indexOf(color);
      if (idx !== -1 && product?.specs?.color_images?.[idx]) {
        setActiveImage(product.specs.color_images[idx]);
      }
    }
  };

  // Xử lý khi người dùng chọn cấu hình RAM/ROM
  const handleSelectRamRom = (ramRom: string) => {
    setSelectedRamRom(ramRom);
    const dbVariants = product?.specs?.variants || [];
    const candidates = dbVariants.filter((v: any) => {
      const vCombined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
      return vCombined === ramRom;
    });

    if (candidates.length > 0) {
      let matched = candidates.find((v: any) => v.color?.toLowerCase() === selectedColor.toLowerCase());
      if (!matched) matched = candidates[0];
      
      if (matched.color) setSelectedColor(matched.color);
      if (matched.condition) setSelectedCondition(matched.condition);
      setSelectedVariant(matched);
      setDisplayPrice(matched.price || product.price);
      if (matched.image) setActiveImage(matched.image);
    }
  };

  // Xử lý khi người dùng chọn Tình Trạng
  const handleSelectCondition = (cond: string) => {
    setSelectedCondition(cond);
    const dbVariants = product?.specs?.variants || [];
    const candidates = dbVariants.filter((v: any) => v.condition?.toLowerCase() === cond.toLowerCase());

    if (candidates.length > 0) {
      let matched = candidates.find((v: any) => v.color?.toLowerCase() === selectedColor.toLowerCase());
      if (!matched) matched = candidates[0];
      
      if (matched.color) setSelectedColor(matched.color);
      const vCombined = matched.ram && matched.storage ? `${matched.ram}/${matched.storage}` : (matched.ram || matched.storage || '');
      if (vCombined) setSelectedRamRom(vCombined);
      setSelectedVariant(matched);
      setDisplayPrice(matched.price || product.price);
      if (matched.image) setActiveImage(matched.image);
    }
  };

  // Tên sản phẩm kèm các tag đã chọn
  const getFinalName = () => {
    if (!product) return '';
    let name = product.name;
    const suffixes = [];
    if (selectedColor) suffixes.push(selectedColor);
    if (selectedRamRom) suffixes.push(selectedRamRom);
    if (selectedCondition) suffixes.push(selectedCondition);
    return suffixes.length > 0 ? `${name} (${suffixes.join(' / ')})` : name;
  };

  const handleAddToCart = () => {
    if (!product) return;
    const finalName = getFinalName();
    addItem({
      id: product.id,
      name: finalName,
      price: displayPrice,
      image: activeImage || product.images?.[0],
      category: product.category,
      brand: product.brand,
    }, quantity);
    alert(`Đã thêm ${quantity} sản phẩm "${finalName}" vào giỏ hàng!`);
  };

  const handleBuyNow = () => {
    if (!product) return;
    addItem({
      id: product.id,
      name: getFinalName(),
      price: displayPrice,
      image: activeImage || product.images?.[0],
      category: product.category,
      brand: product.brand,
    }, quantity);
    router.push('/cart');
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center flex-1">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm text-muted-foreground">Đang tải thông tin sản phẩm...</span>
        </div>
      </div>
    );
  }

  // ── Không tìm thấy ──
  if (!product) {
    return (
      <div className="container mx-auto px-4 py-16 text-center flex-1">
        <p className="text-muted-foreground">Không tìm thấy sản phẩm yêu cầu.</p>
        <Link href="/products" className="text-primary hover:underline mt-4 inline-block">
          Quay lại danh sách sản phẩm
        </Link>
      </div>
    );
  }

  // Trích xuất danh sách các tùy chọn có sẵn từ variants
  const dbVariants = product?.specs?.variants || [];
  
  // 1. Màu sắc
  const finalColors: string[] = [];
  dbVariants.forEach((v: any) => {
    if (v.color && !finalColors.includes(v.color)) {
      finalColors.push(v.color);
    }
  });
  if (finalColors.length === 0) {
    (product?.specs?.color_options || []).forEach((c: string) => finalColors.push(c));
  }

  // 2. RAM/ROM
  const finalRamRoms: string[] = [];
  dbVariants.forEach((v: any) => {
    const combined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
    if (combined && !finalRamRoms.includes(combined)) {
      finalRamRoms.push(combined);
    }
  });

  // 3. Tình trạng
  const finalConditions: string[] = [];
  dbVariants.forEach((v: any) => {
    if (v.condition && !finalConditions.includes(v.condition)) {
      finalConditions.push(v.condition);
    }
  });

  // 1. Phân loại và chuẩn hóa các key tương đương về key chuẩn để tránh trùng lặp
  const getNormalizedKey = (k: string): string => {
    const cleanKey = k.replace(/^(laptop_|mobile_|phone_|product_)/g, '').replace(/_/g, ' ').trim().toLowerCase();
    const noToneKey = cleanKey
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

    if (noToneKey === 'cpu' || noToneKey === 'bo xu ly' || noToneKey === 'dong cpu') return 'cpu';
    if (noToneKey === 'ram' || noToneKey === 'ram may') return 'ram';
    if (noToneKey === 'storage' || noToneKey === 'luu tru' || noToneKey === 'o cung' || noToneKey === 'o cung laptop' || noToneKey === 'hdd sdd') return 'storage';
    if (noToneKey === 'battery' || noToneKey === 'pin') return 'pin';
    if (noToneKey === 'display size' || noToneKey === 'man hinh' || noToneKey === 'kich thuoc man hinh') return 'display_size';
    if (noToneKey === 'display resolution' || noToneKey === 'do phan giai' || noToneKey === 'do phan giai man hinh' || noToneKey === 'do phan giai hien thi') return 'display_resolution';
    if (noToneKey === 'dimensions' || noToneKey === 'kich thuoc' || noToneKey === 'kich thuoc thiet bi' || noToneKey === 'kich thuoc san pham') return 'dimensions';
    if (noToneKey === 'bluetooth' || noToneKey === 'ket noi bluetooth') return 'bluetooth';
    
    return cleanKey;
  };

  // 2. Lọc whitelist và khử trùng lặp specs
  const specsMap = new Map<string, { originalKey: string; val: any }>();
  Object.entries(product.specs || {}).forEach(([key, val]) => {
    const cleanKey = key.replace(/^(laptop_|mobile_|phone_|product_)/g, '').trim().toLowerCase();
    const isAllowed = ALLOWED_SPEC_KEYS.has(key.toLowerCase()) || ALLOWED_SPEC_KEYS.has(cleanKey);
    if (!isAllowed) return;

    if (val === null || val === undefined) return;
    const strVal = String(val).trim();
    if (strVal === '' || strVal.toLowerCase() === 'null' || strVal.toLowerCase() === 'undefined') return;

    const normKey = getNormalizedKey(key);
    if (specsMap.has(normKey)) {
      const existing = specsMap.get(normKey)!;
      // Giữ lại giá trị có mô tả dài hơn/chi tiết hơn
      if (String(val).length > String(existing.val).length) {
        specsMap.set(normKey, { originalKey: key, val });
      }
    } else {
      specsMap.set(normKey, { originalKey: key, val });
    }
  });

  const displaySpecs = Array.from(specsMap.values()).map(
    ({ originalKey, val }): [string, any] => [originalKey, val]
  );

  // Kiểm tra xem một thuộc tính có khả dụng với các lựa chọn hiện tại hay không
  const isColorAvailable = (colorName: string) => {
    return dbVariants.some((v: any) => {
      const vCombined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
      const matchRamRom = !selectedRamRom || vCombined === selectedRamRom;
      const matchCondition = !selectedCondition || v.condition?.toLowerCase() === selectedCondition.toLowerCase();
      return v.color?.toLowerCase() === colorName.toLowerCase() && matchRamRom && matchCondition;
    });
  };

  const isRamRomAvailable = (ramRomVal: string) => {
    return dbVariants.some((v: any) => {
      const vCombined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
      const matchColor = !selectedColor || v.color?.toLowerCase() === selectedColor.toLowerCase();
      const matchCondition = !selectedCondition || v.condition?.toLowerCase() === selectedCondition.toLowerCase();
      return vCombined === ramRomVal && matchColor && matchCondition;
    });
  };

  const isConditionAvailable = (condVal: string) => {
    return dbVariants.some((v: any) => {
      const vCombined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
      const matchColor = !selectedColor || v.color?.toLowerCase() === selectedColor.toLowerCase();
      const matchRamRom = !selectedRamRom || vCombined === selectedRamRom;
      return v.condition?.toLowerCase() === condVal.toLowerCase() && matchColor && matchRamRom;
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 flex-1 space-y-12 transition-colors duration-200">
      {/* Nút quay lại */}
      <div>
        <Link href="/products" className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span>Quay lại danh sách</span>
        </Link>
      </div>

      {/* THÔNG TIN CHI TIẾT SẢN PHẨM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Cột trái: Thư viện Ảnh */}
        <div className="space-y-4">
          <div className="w-full aspect-square rounded-2xl bg-card border border-border flex items-center justify-center overflow-hidden p-8">
            {activeImage ? (
              <img src={activeImage} alt={product.name} className="w-[90%] h-[90%] object-contain" />
            ) : (
              <div className="w-full h-full bg-muted/40 flex items-center justify-center rounded-xl">
                <span className="text-muted-foreground text-sm">Không có ảnh</span>
              </div>
            )}
          </div>
          {/* Thumbnail gallery */}
          {product.images?.length > 1 && (
            <div className="flex gap-3 overflow-x-auto py-1">
              {product.images.map((img: string, index: number) => (
                <button
                  key={index}
                  onClick={() => setActiveImage(img)}
                  className={`w-20 h-20 rounded-xl bg-card border overflow-hidden p-2 flex items-center justify-center flex-shrink-0 transition-all cursor-pointer ${
                    activeImage === img ? 'border-primary shadow-md shadow-primary/10' : 'border-border hover:border-muted-foreground/35'
                  }`}
                >
                  <img src={img} alt={`${product.name} ${index + 1}`} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cột phải: Thông tin & Nút mua */}
        <div className="space-y-5">
          {/* Brand + Tên + Rating */}
          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 uppercase">
              {product.brand}
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground leading-tight">
              {product.name}
            </h1>
            {product.rating_avg && (
              <div className="flex items-center gap-1 text-sm text-yellow-500">
                <Star className="w-4 h-4 fill-yellow-500" />
                <span className="font-bold text-foreground">{product.rating_avg}</span>
                <span className="text-muted-foreground">
                  ({product.specs?.ratings_count
                    ? `${Number(product.specs.ratings_count).toLocaleString('vi-VN')} đánh giá Amazon`
                    : `${reviews.length} đánh giá`})
                </span>
              </div>
            )}
          </div>

          {/* Giá (cập nhật theo variant đã chọn) */}
          <div className="space-y-1">
            <div className="text-3xl font-black text-primary">
              {formatPrice(displayPrice)}
            </div>
            {dbVariants.length > 1 && selectedVariant && (
              <p className="text-xs text-muted-foreground">
                Giá cho cấu hình: <span className="font-semibold text-foreground">{selectedVariant.label}</span>
              </p>
            )}
          </div>

          {/* Cam kết dịch vụ */}
          {(() => {
            const defaultPolicies = ['Chính hãng 100%', 'Giao nhanh toàn quốc', 'Lỗi 1 đổi 1'];
            const policies = (product.specs?.policy_tags && Array.isArray(product.specs.policy_tags) && product.specs.policy_tags.length > 0)
              ? product.specs.policy_tags
              : defaultPolicies;

            const getPolicyIcon = (text: string) => {
              const lower = text.toLowerCase();
              if (lower.includes('chính hãng') || lower.includes('bảo hành') || lower.includes('cam kết') || lower.includes('an tâm') || lower.includes('shield')) {
                return <ShieldCheck className="w-5 h-5 text-emerald-500" />;
              }
              if (lower.includes('giao') || lower.includes('ship') || lower.includes('vận chuyển') || lower.includes('nhanh') || lower.includes('hỏa tốc') || lower.includes('vận') || lower.includes('xe')) {
                return <Truck className="w-5 h-5 text-primary" />;
              }
              if (lower.includes('đổi') || lower.includes('trả') || lower.includes('hoàn') || lower.includes('1 đổi 1') || lower.includes('ref')) {
                return <RefreshCw className="w-5 h-5 text-primary" />;
              }
              if (lower.includes('góp') || lower.includes('lãi') || lower.includes('thẻ') || lower.includes('credit') || lower.includes('card')) {
                return <CreditCard className="w-5 h-5 text-indigo-500" />;
              }
              if (lower.includes('tặng') || lower.includes('quà') || lower.includes('ưu đãi') || lower.includes('khuyến mại') || lower.includes('giảm') || lower.includes('gift') || lower.includes('voucher')) {
                return <Gift className="w-5 h-5 text-rose-500" />;
              }
              if (lower.includes('hỗ trợ') || lower.includes('kỹ thuật') || lower.includes('24/7') || lower.includes('tư vấn') || lower.includes('alo') || lower.includes('hotline') || lower.includes('support')) {
                return <Headphones className="w-5 h-5 text-sky-500" />;
              }
              if (lower.includes('giá') || lower.includes('rẻ') || lower.includes('tốt nhất') || lower.includes('best') || lower.includes('award') || lower.includes('bao giá')) {
                return <Award className="w-5 h-5 text-amber-500" />;
              }
              return <Star className="w-5 h-5 text-amber-500" />;
            };

            return (
              <div className="flex flex-wrap items-center justify-around gap-4 border-y border-border py-4 text-xs text-muted-foreground">
                {policies.map((policy: string, idx: number) => (
                  <div key={idx} className="flex flex-col items-center text-center gap-2 flex-1 min-w-[80px]">
                    {getPolicyIcon(policy)}
                    <span className="font-semibold">{policy}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Mô tả */}
          {product.description && !product.description.includes('; CPU:') ? (
            <p className="text-muted-foreground text-sm leading-relaxed">{product.description}</p>
          ) : (
            <p className="text-muted-foreground text-sm leading-relaxed italic">
              Sản phẩm chính hãng {product.brand} - {product.name} được phân phối với mức giá ưu đãi tốt nhất, bảo hành chính hãng đầy đủ.
            </p>
          )}

          {/* ── CHỌN TÌNH TRẠNG / PHÂN LOẠI ── */}
          {finalConditions.length > 0 && (
            <div className="space-y-2.5 border-t border-border/40 pt-4">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Phân loại / Tình trạng:
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {finalConditions.map((cond: string) => {
                  const isAvailable = isConditionAvailable(cond);
                  return (
                    <button
                      key={cond}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => handleSelectCondition(cond)}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 text-left ${
                        selectedCondition === cond
                          ? 'border-primary bg-primary/10 text-primary shadow-sm shadow-primary/10'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      } ${!isAvailable ? 'opacity-25 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                    >
                      {cond}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── CHỌN CẤU HÌNH (RAM/ROM) ── */}
          {finalRamRoms.length > 0 && (
            <div className="space-y-2.5 border-t border-border/40 pt-4">
              <div className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Phiên bản / Cấu hình:
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {finalRamRoms.map((ramRom: string) => {
                  const matchedVars = dbVariants.filter((v: any) => {
                    const vCombined = v.ram && v.storage ? `${v.ram}/${v.storage}` : (v.ram || v.storage || '');
                    return vCombined === ramRom;
                  });
                  const minPrice = matchedVars.length > 0 ? Math.min(...matchedVars.map((v: any) => v.price || product.price)) : 0;
                  const isAvailable = isRamRomAvailable(ramRom);

                  return (
                    <button
                      key={ramRom}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => handleSelectRamRom(ramRom)}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-95 text-left ${
                        selectedRamRom === ramRom
                          ? 'border-primary bg-primary/10 text-primary shadow-sm shadow-primary/10'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      } ${!isAvailable ? 'opacity-25 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                    >
                      <div>{ramRom}</div>
                      {minPrice > 0 && minPrice !== product.price && (
                        <div className={`text-[10px] font-normal mt-0.5 ${selectedRamRom === ramRom ? 'text-primary/80' : 'text-muted-foreground'}`}>
                          {formatPrice(minPrice)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── CHỌN MÀU SẮC ── */}
          {finalColors.length > 0 && (
            <div className="space-y-2.5 border-t border-border/40 pt-4">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Màu sắc: {selectedColor && <span className="text-foreground normal-case font-semibold">{selectedColor}</span>}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {finalColors.map((colorName: string) => {
                  let matchedImage = '';
                  const idx = product?.specs?.color_options?.indexOf(colorName);
                  if (idx !== -1 && product?.specs?.color_images?.[idx]) {
                    matchedImage = product.specs.color_images[idx];
                  } else {
                    const matchedVar = dbVariants.find((v: any) => v.color?.toLowerCase() === colorName.toLowerCase() && v.image);
                    if (matchedVar) matchedImage = matchedVar.image;
                  }
                  const isAvailable = isColorAvailable(colorName);

                  return (
                    <button
                      key={colorName}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => {
                        handleSelectColor(colorName);
                        if (matchedImage) setActiveImage(matchedImage);
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                        selectedColor === colorName
                          ? 'border-primary bg-primary/10 text-primary shadow-sm shadow-primary/5'
                          : 'border-border bg-card text-foreground hover:bg-muted'
                      } ${!isAvailable ? 'opacity-25 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                    >
                      {colorName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Số lượng */}
          <div className="flex items-center gap-4 border-t border-border/40 pt-4">
            <span className="text-sm font-semibold text-muted-foreground">Số lượng:</span>
            <div className="flex items-center border border-border rounded-xl overflow-hidden bg-card">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all font-bold cursor-pointer"
              >
                -
              </button>
              <span className="w-12 text-center text-foreground font-bold">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all font-bold cursor-pointer"
              >
                +
              </button>
            </div>
            <span className="text-xs text-muted-foreground">({product.stock} còn hàng)</span>
          </div>

          {/* Nút hành động */}
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex gap-4">
              <button
                onClick={handleAddToCart}
                disabled={product.stock === 0}
                className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold transition-all text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Thêm vào giỏ</span>
              </button>
              <button
                onClick={handleBuyNow}
                disabled={product.stock === 0}
                className="flex-1 h-12 rounded-xl bg-primary hover:opacity-95 text-primary-foreground font-bold hover:shadow-lg hover:shadow-primary/20 active:scale-95 transition-all text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {product.stock === 0 ? 'Hết hàng' : 'Mua ngay'}
              </button>
            </div>

            {product.specs?.original_link && (
              <a
                href={product.specs.original_link}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-amber-500/35 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600 dark:text-amber-500 font-bold transition-all text-xs"
              >
                <span>🌐 Xem sản phẩm gốc trên Amazon India</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* THÔNG SỐ KỸ THUẬT & REVIEWS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-8 border-t border-border">
        {/* Specs */}
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-foreground">Thông số kỹ thuật chi tiết</h2>



          {/* Bảng specs kỹ thuật */}
          {displaySpecs.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card/20 overflow-hidden">
              {displaySpecs.map(([key, val]: [string, any], index: number) => (
                <div
                  key={key}
                  className={`grid grid-cols-3 p-4 text-xs sm:text-sm border-b border-border/50 last:border-0 ${
                    index % 2 === 0 ? 'bg-muted/30' : ''
                  }`}
                >
                  <span className="font-semibold text-muted-foreground">{getSpecLabel(key)}</span>
                  <span className="col-span-2 text-foreground font-medium">
                    {Array.isArray(val) ? val.join(', ') : String(val)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm italic">Chưa có thông số kỹ thuật chi tiết.</p>
          )}

          {/* Đặc điểm nổi bật / Mô tả sản phẩm dài */}
          <div className="mt-8 space-y-4 pt-4 border-t border-border/40">
            <h2 className="text-lg font-bold text-foreground">Đặc điểm nổi bật</h2>
            {product.key_selling_points ? (
              <div 
                className="prose prose-invert max-w-none text-muted-foreground text-sm leading-relaxed bg-card/10 rounded-2xl p-6 border border-border/40"
                dangerouslySetInnerHTML={{ __html: product.key_selling_points }}
              />
            ) : (
              <div className="prose prose-invert max-w-none text-muted-foreground text-sm leading-relaxed bg-card/10 rounded-2xl p-6 border border-border/40 space-y-4">
                <p>
                  <strong>{product.name}</strong> là sản phẩm chính hãng thuộc dòng thiết bị của hãng{' '}
                  <strong>{product.brand || 'nhà sản xuất'}</strong>. Thiết bị được tối ưu cấu hình và thiết kế để mang
                  lại trải nghiệm sử dụng xuất sắc cho người dùng.
                </p>
                <ul className="list-disc pl-5 space-y-2 mt-2">
                  {product.cpu && (
                    <li>
                      Trang bị vi xử lý <strong>{product.cpu}</strong> hiệu năng cao, tối ưu năng lượng cực tốt.
                    </li>
                  )}
                  {product.ram && (
                    <li>
                      Dung lượng RAM <strong>{product.ram}</strong> cho khả năng đa nhiệm mượt mà, hạn chế giật lag khi chuyển đổi ứng dụng.
                    </li>
                  )}
                  {product.storage && (
                    <li>
                      Bộ nhớ trong <strong>{product.storage}</strong> rộng lớn, giúp lưu trữ hình ảnh, video và tài liệu công việc thoải mái.
                    </li>
                  )}
                  {product.display_size && (
                    <li>
                      Màn hình rộng <strong>{product.display_size}</strong> với độ phân giải{' '}
                      <strong>{product.display_resolution || 'chuẩn HD'}</strong> mang lại trải nghiệm hiển thị sắc nét, sống động.
                    </li>
                  )}
                  {product.battery && (
                    <li>
                      Sở hữu dung lượng pin <strong>{product.battery}</strong> tối ưu giúp hoạt động liên tục trong thời gian dài.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Reviews */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-foreground">Đánh giá từ khách hàng</h2>
          {reviews.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">Chưa có đánh giá nào cho sản phẩm này.</p>
          ) : (
            <div className="space-y-4">
              {reviews.map((rev: any) => (
                <div key={rev.id} className="p-4 rounded-xl bg-card/30 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground text-xs">{rev.user_name || 'Khách hàng'}</span>
                    <span className="text-[10px] text-muted-foreground">{rev.created_at}</span>
                  </div>
                  <div className="flex text-yellow-500">
                    {Array.from({ length: rev.rating }).map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-yellow-500" />
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">{rev.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
