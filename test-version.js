// Simple test to check which admin auth is being used
console.log('=== VERSION TEST ===');
console.log('Checking admin auth imports...');

try {
    const adminAuthBasic = require('./src/middleware/adminAuthBasic');
    console.log('✓ adminAuthBasic is available');
} catch (e) {
    console.log('✗ adminAuthBasic not available:', e.message);
}

try {
    const adminAuthSimple = require('./src/middleware/adminAuthSimple');
    console.log('✓ adminAuthSimple is available');
} catch (e) {
    console.log('✗ adminAuthSimple not available:', e.message);
}

try {
    const adminAuth = require('./src/middleware/adminAuth');
    console.log('✓ adminAuth is available');
} catch (e) {
    console.log('✗ adminAuth not available:', e.message);
}

console.log('=== VERSION TEST END ===');
