import CryptoJS from 'crypto-js';

// 브라우저의 유저 에이전트 정보를 키 생성의 일부로 활용하여 단순 복사를 방지
export const getEncryptionKey = () => {
    const userAgent = typeof window !== 'undefined' ? navigator.userAgent : 'server-fallback-key';
    const SALT = 'QUANT_SERVER_PROTECT_2024';
    return CryptoJS.SHA256(userAgent + SALT).toString();
};

export const encryptData = (data: any): string => {
    if (!data) return '';
    try {
        const key = getEncryptionKey();
        return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
    } catch (error) {
        console.error('Encryption failed', error);
        return '';
    }
};

export const decryptData = (ciphertext: string): any => {
    if (!ciphertext) return null;
    
    // 단순 평문(암호화 전송 이전 데이터) 마이그레이션을 위한 처리
    if (!ciphertext.startsWith('U2FsdGVkX1')) {
        try {
            return JSON.parse(ciphertext); 
        } catch {
            return ciphertext;
        }
    }

    try {
        const key = getEncryptionKey();
        const bytes = CryptoJS.AES.decrypt(ciphertext, key);
        const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decryptedStr) return null;
        
        return JSON.parse(decryptedStr);
    } catch (error) {
        // 복호화 실패 시 null 반환 (만약 키가 달라진 경우 등)
        return null;
    }
};
