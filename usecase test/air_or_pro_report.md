# Test: "cho a 7 dòng laptop macbook air hoặc pro dưới 35 triệu"

## Hành vi agent

Agent thực hiện 2 lần gọi tool trong cùng turn:

**Call 1 (chưa tối ưu):**
```python
product_search({
  'queries': [{
    'limit': 7,
    'keyword': 'MacBook Air Pro',
    'max_price': 35000000,
    'mode': 'lines',
    'include_details': True
  }]
})
```
- Không có `brand`, `category`, `name_contains`.
- SQL pre-filter chỉ theo `final_price <= 35 triệu` nên lấy cả điện thoại/phụ kiện; kết quả Chroma bị nhiễu.

**Call 2 (tự sửa):**
```python
product_search({
  'queries': [
    {
      'keyword': 'MacBook Air',
      'brand': 'Apple',
      'category': 'laptop',
      'name_contains': 'MacBook Air',
      'max_price': 35000000,
      'mode': 'lines',
      'limit': 5,
      'include_details': True
    },
    {
      'keyword': 'MacBook Pro',
      'brand': 'Apple',
      'category': 'laptop',
      'name_contains': 'MacBook Pro',
      'max_price': 35000000,
      'mode': 'lines',
      'limit': 5,
      'include_details': True
    }
  ]
})
```
- Tách thành 2 query: MacBook Air và MacBook Pro.
- Đủ `brand`, `category`, `name_contains`.

## Kết quả cuối

- **MacBook Air dưới 35 triệu:** M1, M2, M3, M4 (đủ 4 dòng).
- **MacBook Pro dưới 35 triệu:** không có (Pro 14 M4 từ ~38,59 triệu trở lên).

Final answer hợp lý, nhưng agent mất thêm 1 lượt gọi sai do ban đầu gộp "Air hoặc Pro" thành keyword đơn.

