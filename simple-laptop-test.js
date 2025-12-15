// 在浏览器控制台中运行这个脚本来测试

console.log('=== 简化的笔记本电脑测试 ===');

// 1. 直接获取元素
const categorySelect = document.getElementById('category_id');
const specificationsInput = document.getElementById('specifications');
const laptopBrandInput = document.getElementById('laptop_brand');
const laptopModelInput = document.getElementById('laptop_model');

console.log('元素检查:', {
    categorySelect: !!categorySelect,
    specificationsInput: !!specificationsInput,
    laptopBrandInput: !!laptopBrandInput,
    laptopModelInput: !!laptopModelInput
});

// 2. 创建一个简单的更新函数
function simpleUpdateLaptopSpec() {
    if (!laptopBrandInput || !laptopModelInput || !specificationsInput) {
        console.log('元素不存在');
        return;
    }
    
    const brand = laptopBrandInput.value.trim();
    const model = laptopModelInput.value.trim();
    const currentValue = specificationsInput.value;
    
    console.log('输入值:', { brand, model });
    console.log('当前产品型号:', currentValue);
    
    if (brand && model) {
        const newValue = `${brand} ${model}`;
        specificationsInput.value = newValue;
        console.log('设置新产品型号:', newValue);
        console.log('是否成功:', specificationsInput.value === newValue);
    } else if (model) {
        const newValue = model;
        specificationsInput.value = newValue;
        console.log('设置仅型号:', newValue);
        console.log('是否成功:', specificationsInput.value === newValue);
    }
}

// 3. 如果元素存在，添加监听器
if (laptopBrandInput) {
    laptopBrandInput.addEventListener('input', simpleUpdateLaptopSpec);
    laptopBrandInput.addEventListener('keyup', simpleUpdateLaptopSpec);
    console.log('品牌监听器已添加');
}

if (laptopModelInput) {
    laptopModelInput.addEventListener('input', simpleUpdateLaptopSpec);
    laptopModelInput.addEventListener('keyup', simpleUpdateLaptopSpec);
    console.log('型号监听器已添加');
}

// 4. 手动测试
console.log('开始手动测试...');
if (laptopBrandInput) {
    laptopBrandInput.value = '联想';
    laptopBrandInput.dispatchEvent(new Event('input'));
    console.log('品牌输入完成');
}

if (laptopModelInput) {
    laptopModelInput.value = 'ThinkPad X1';
    laptopModelInput.dispatchEvent(new Event('input'));
    console.log('型号输入完成');
}

setTimeout(() => {
    console.log('最终产品型号:', specificationsInput.value);
    console.log('预期: 联想 ThinkPad X1');
}, 100);