// 这是一个测试脚本，用于在浏览器控制台中执行
// 请复制以下代码到浏览器控制台并执行

console.log('测试笔记本电脑功能...');

// 获取相关元素
const categorySelect = document.getElementById('category_id');
const laptopConfig = document.getElementById('laptopConfig');
const specificationsInput = document.getElementById('specifications');
const laptopBrandInput = document.getElementById('laptop_brand');
const laptopModelInput = document.getElementById('laptop_model');

console.log('类别选择框:', categorySelect);
console.log('笔记本电脑配置区域:', laptopConfig);
console.log('产品型号输入框:', specificationsInput);
console.log('笔记本电脑品牌输入框:', laptopBrandInput);
console.log('笔记本电脑型号输入框:', laptopModelInput);

// 查找包含"笔记本电脑"的选项
let laptopOption = null;
if (categorySelect) {
    for (let i = 0; i < categorySelect.options.length; i++) {
        if (categorySelect.options[i].text.includes('笔记本电脑')) {
            laptopOption = categorySelect.options[i];
            console.log('找到笔记本电脑选项:', laptopOption);
            break;
        }
    }
}

// 如果找到了选项，测试选择它
if (laptopOption) {
    categorySelect.value = laptopOption.value;
    categorySelect.dispatchEvent(new Event('change'));
    
    // 等待一下，让DOM更新
    setTimeout(() => {
        console.log('选择笔记本电脑类别后的状态:');
        console.log('笔记本电脑配置区域显示状态:', laptopConfig.style.display);
        
        // 尝试在品牌和型号框中输入内容
        if (laptopBrandInput) {
            laptopBrandInput.value = '测试品牌';
            laptopBrandInput.dispatchEvent(new Event('input'));
            console.log('品牌输入框值:', laptopBrandInput.value);
        }
        
        if (laptopModelInput) {
            laptopModelInput.value = '测试型号';
            laptopModelInput.dispatchEvent(new Event('input'));
            console.log('型号输入框值:', laptopModelInput.value);
        }
        
        // 等待一下，检查产品型号是否更新
        setTimeout(() => {
            console.log('产品型号输入框值:', specificationsInput.value);
            console.log('预期值: 测试品牌 测试型号');
        }, 100);
    }, 100);
} else {
    console.log('未找到笔记本电脑选项，请检查类别列表');
}