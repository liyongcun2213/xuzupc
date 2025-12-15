// 在浏览器控制台中运行此代码来诊断问题
console.log('=== 笔记本电脑自动填充功能调试 ===');

// 1. 检查页面元素是否存在
const categorySelect = document.getElementById('category_id');
const specificationsInput = document.getElementById('specifications');
const laptopBrandInput = document.getElementById('laptop_brand');
const laptopModelInput = document.getElementById('laptop_model');

console.log('类别选择框:', categorySelect);
console.log('产品型号输入框:', specificationsInput);
console.log('笔记本电脑品牌输入框:', laptopBrandInput);
console.log('笔记本电脑型号输入框:', laptopModelInput);

// 2. 检查当前选择的类别
if (categorySelect) {
    const selectedOption = categorySelect.options[categorySelect.selectedIndex];
    const categoryName = selectedOption ? selectedOption.text.trim() : '';
    console.log('当前选择的类别:', categoryName);
    console.log('是否包含"笔记本电脑":', categoryName.includes('笔记本电脑'));
}

// 3. 检查当前输入框的值
if (laptopBrandInput) {
    console.log('品牌输入框值:', laptopBrandInput.value);
}
if (laptopModelInput) {
    console.log('型号输入框值:', laptopModelInput.value);
}
if (specificationsInput) {
    console.log('产品型号输入框值:', specificationsInput.value);
}

// 4. 手动触发updateLaptopSpecifications函数
function updateLaptopSpecifications() {
    console.log('触发updateLaptopSpecifications函数');
    if (!specificationsInput || !laptopBrandInput || !laptopModelInput) {
        console.log('缺少必要元素，无法执行');
        return;
    }

    const brand = laptopBrandInput.value.trim();
    const model = laptopModelInput.value.trim();
    console.log('品牌:', brand);
    console.log('型号:', model);

    const oldValue = specificationsInput.value;
    
    if (brand && model) {
        specificationsInput.value = `${brand} ${model}`;
        console.log('设置产品型号为:', specificationsInput.value);
    } else if (model) {
        specificationsInput.value = model;
        console.log('设置产品型号为(仅型号):', specificationsInput.value);
    } else {
        specificationsInput.value = '';
        console.log('清空产品型号');
    }
    
    console.log('产品型号是否变化:', oldValue !== specificationsInput.value);
}

// 手动执行一次
updateLaptopSpecifications();