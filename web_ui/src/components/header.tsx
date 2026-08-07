'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCart } from '@/store/useCart';
import { supabase } from '@/lib/supabase';
import { ShoppingCart, User, Search, Laptop, Smartphone, Watch, Headphones, Layers, Sun, Moon, X, Tv } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  price: number;
  images: string[];
  category: string;
  brand: string;
}

interface SuggestionItem {
  name: string;
  fullName: string;
  image?: string;
}

export default function Header() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const shouldHideCategories = pathname?.startsWith('/account') || pathname?.startsWith('/policy') || pathname?.startsWith('/admin');
  
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);
  const totalItems = useCart((state) => state.getTotalItems());
  
  // States cho tính năng gợi ý tìm kiếm thông minh
  const [isFocused, setIsFocused] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);

    // Lấy thông tin user hiện tại từ Supabase Auth
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    };
    
    getUser();

    // Lắng nghe thay đổi trạng thái đăng nhập
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    // Phát hiện theme hiện tại
    if (typeof window !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    }

    // Tải trước toàn bộ sản phẩm để phục vụ tìm kiếm Dynamic Client-side siêu tốc
    const fetchAllProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, price, category, brand, image_url, thumbnail');
        if (!error && data) {
          const mappedData = data.map((p: any) => {
            const images = [];
            if (p.image_url) images.push(p.image_url);
            else if (p.thumbnail) images.push(p.thumbnail);
            else images.push('https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600');
            return {
              ...p,
              images
            };
          });
          setAllProducts(mappedData);
        }
      } catch (err) {
        console.warn('Lỗi tải danh sách sản phẩm gợi ý:', err);
      }
    };
    fetchAllProducts();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Xử lý click outside để ẩn popup tìm kiếm
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Chuyển đổi tiếng Việt có dấu thành không dấu để tìm kiếm thông minh
  const removeVietnameseTones = (str: string) => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  };

  // Trích xuất tên ngắn gọn (bỏ bớt phần dung lượng RAM/ROM để in popup gợi ý đẹp mắt)
  const getShortName = (name: string) => {
    const short = name.split(/(?:\d+GB|\d+TB|5G|4G|LTE|Chính hãng|xách tay|cũ|mới|RAM|ROM)/i)[0].trim();
    if (short.length < 5) return name.substring(0, 25);
    return short;
  };

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setSuggestions([]);
      setSuggestedProducts([]);
      return;
    }

    const queryClean = removeVietnameseTones(value.trim());
    const queryWords = queryClean.split(/\s+/).filter(Boolean);

    // Lọc các sản phẩm khớp bằng thuật toán Word-Prefix Matching thông minh
    const filtered = allProducts.filter(p => {
      const nameClean = removeVietnameseTones(p.name || '');
      const brandClean = removeVietnameseTones(p.brand || '');
      const catClean = removeVietnameseTones(p.category || '');
      
      const productWords = `${nameClean} ${brandClean} ${catClean}`.split(/[\s\-\/\,\.\(\)]+/).filter(Boolean);
      
      return queryWords.every(qw => 
        productWords.some(pw => pw.startsWith(qw))
      );
    });

    // 1. Tạo danh sách "Sản phẩm gợi ý" (tối đa 5 sản phẩm)
    setSuggestedProducts(filtered.slice(0, 5));

    // 2. Tạo danh sách "Có phải bạn muốn tìm" (tên ngắn kèm ảnh thu nhỏ)
    const sugMap = new Map<string, SuggestionItem>();
    filtered.forEach(p => {
      const shortName = getShortName(p.name);
      if (!sugMap.has(shortName)) {
        sugMap.set(shortName, {
          name: shortName,
          fullName: p.name,
          image: p.images?.[0] || undefined
        });
      }
    });
    setSuggestions(Array.from(sugMap.values()).slice(0, 6)); // Tối đa 6 từ khóa gợi ý
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsFocused(false);
    if (searchQuery.trim()) {
      router.push(`/products?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/products');
    }
  };

  const handleSuggestionClick = (fullName: string) => {
    setSearchQuery(fullName);
    setIsFocused(false);
    router.push(`/products?q=${encodeURIComponent(fullName)}`);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setSuggestedProducts([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsFocused(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('mock_user_logged');
    router.push('/');
    router.refresh();
  };

  const toggleTheme = () => {
    if (theme === 'light') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setTheme('dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setTheme('light');
    }
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-md transition-colors duration-200">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* LOGO */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="bg-primary p-2 rounded-lg text-primary-foreground font-bold shadow-md shadow-primary/20 transition-all">
            4C
          </span>
          <span className="text-xl font-extrabold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent group-hover:text-primary transition-all">
            4Customer
          </span>
        </Link>

        {/* SEARCH BAR & SUGGESTION POPUP CONTAINER */}
        <div ref={searchContainerRef} className="hidden md:block relative flex-1 max-w-md z-50">
          <form onSubmit={handleSearch} className="relative w-full">
            <input
              type="text"
              placeholder="Tìm kiếm sản phẩm, thương hiệu..."
              value={searchQuery}
              onFocus={() => setIsFocused(true)}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-10 pl-4 pr-16 rounded-full border border-border bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                title="Xóa tìm kiếm"
                className="absolute right-10 top-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <button type="submit" className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <Search className="w-5 h-5" />
            </button>
          </form>

          {/* DROPDOWN GỢI Ý THÔNG MINH */}
          {isFocused && (suggestions.length > 0 || suggestedProducts.length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 border border-border rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden max-h-[420px] overflow-y-auto z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* 1. CÓ PHẢI BẠN MUỐN TÌM */}
              {suggestions.length > 0 && (
                <div className="p-4 border-b border-border/60">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-2.5 select-none">
                    <Search className="w-3.5 h-3.5 text-primary" />
                    <span>Có phải bạn muốn tìm</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {suggestions.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSuggestionClick(item.fullName)}
                        className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted/70 cursor-pointer transition-all border border-transparent hover:border-border"
                      >
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-7 h-7 object-cover rounded-md flex-shrink-0 border border-border/40" />
                        ) : (
                          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-foreground truncate hover:text-primary transition-colors">
                          {item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. SẢN PHẨM GỢI Ý */}
              {suggestedProducts.length > 0 && (
                <div className="p-4 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-muted-foreground tracking-wider mb-1 select-none">
                    <span>🔥 Sản phẩm gợi ý</span>
                  </div>
                  <div className="space-y-1.5">
                    {suggestedProducts.map((p) => {
                      const priceVal = p.price;
                      const originalPrice = Math.round(priceVal * 1.25);
                      return (
                        <Link
                          key={p.id}
                          href={`/products/${p.id}`}
                          onClick={() => setIsFocused(false)}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/70 transition-all cursor-pointer group border border-transparent hover:border-border"
                        >
                          <img
                            src={p.images?.[0] || 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600'}
                            alt={p.name}
                            className="w-10 h-10 object-cover rounded-lg flex-shrink-0 border border-border"
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-extrabold text-foreground group-hover:text-primary transition-colors truncate">
                              {p.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-black text-red-600 dark:text-red-500">
                                {formatPrice(priceVal)}
                              </span>
                              <span className="text-[10px] text-muted-foreground line-through">
                                {formatPrice(originalPrice)}
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* NAVIGATION & ACTION BUTTONS */}
        <div className="flex items-center gap-3">
          {/* NÚT TOGGLE THEME */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={mounted && theme === 'light' ? 'Chuyển sang Dark Mode' : 'Chuyển sang Light Mode'}
          >
            {mounted && theme === 'dark' ? (
              <Sun className="w-5 h-5 text-primary" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>

          {/* GIỎ HÀNG */}
          <Link href="/cart" className="relative p-2.5 text-muted-foreground hover:text-foreground transition-colors">
            <ShoppingCart className="w-6 h-6" />
            {mounted && totalItems > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md shadow-primary/35 animate-bounce">
                {totalItems}
              </span>
            )}
          </Link>

          {/* HỒ SƠ CÁ NHÂN / ĐĂNG NHẬP */}
          {user ? (
            <Link
              href="/account"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border hover:border-muted-foreground/35 transition-colors cursor-pointer"
            >
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt="avatar"
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground uppercase">
                  {user.email?.substring(0, 2)}
                </div>
              )}
              <span className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground max-w-[120px] truncate font-medium">
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth/login"
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full bg-primary hover:bg-primary/95 text-primary-foreground shadow-md shadow-primary/20 hover:shadow-primary/45 transition-all"
            >
              <User className="w-4 h-4" />
              <span>Đăng nhập</span>
            </Link>
          )}
        </div>
      </div>

      {/* DANH MỤC SẢN PHẨM Ở DƯỚI */}
      {!shouldHideCategories && (
        <div className="border-t border-border bg-card">
          <div className="container mx-auto px-4 flex items-center justify-start overflow-x-auto gap-6 h-10 text-xs no-scrollbar">
            <Link href="/products" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors py-1.5 whitespace-nowrap">
              Tất cả sản phẩm
            </Link>
            <Link href="/products?category=laptop" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors py-1.5 whitespace-nowrap">
              <Laptop className="w-3.5 h-3.5" />
              Laptop
            </Link>
            <Link href="/products?category=phone" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors py-1.5 whitespace-nowrap">
              <Smartphone className="w-3.5 h-3.5" />
              Điện thoại
            </Link>
            <Link href="/products?category=smartwatch" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors py-1.5 whitespace-nowrap">
              <Watch className="w-3.5 h-3.5" />
              Đồng hồ
            </Link>
            <Link href="/products?category=earphone" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors py-1.5 whitespace-nowrap">
              <Headphones className="w-3.5 h-3.5" />
              Tai nghe
            </Link>
            <Link href="/products?category=tv" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors py-1.5 whitespace-nowrap">
              <Tv className="w-3.5 h-3.5" />
              Tivi
            </Link>
            <Link href="/products?category=accessory" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors py-1.5 whitespace-nowrap">
              <Layers className="w-3.5 h-3.5" />
              Phụ kiện
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
