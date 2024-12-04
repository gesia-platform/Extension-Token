## ExtensionToken 스마트 컨트랙트

ExtensionToken 스마트 컨트랙트는 탄소 크레딧과 관련된 토큰을 관리하는 ERC1155 기반의 확장형 토큰 관리 솔루션입니다. 이 컨트랙트는 다음과 같은 주요 기능을 제공합니다.

1. 탄소 토큰 발행
2. 서명 기반 전송
3. 선물 전송

---

### 함수 목록 및 설명

#### **1. 생성자**

**설명:** 컨트랙트를 초기화하며 토큰의 기본 정보와 수수료 관리 컨트랙트 주소를 설정합니다.

**파라미터**

- `_name` (string) : 토큰 이름

- `_symbol` (string) : 토큰 이름

- `_feeManager` (address) : 수수료 관리자 컨트랙트 주소

**로직**

1. 입력된 `_name`, `_symbol`, `_feeManager`를 설정합니다.
2. `_tokenIdTracker`를 1로 초기화합니다.

```solidity
constructor(
    string memory _name,
    string memory _symbol,
    address _feeManager
) ERC1155("") {
    name = _name;
    symbol = _symbol;
    feeManager = _feeManager;
    _tokenIdTracker.increment(); // Start token ID from 1
}
```

------

#### **2. `mint`**

**설명:** 운영자 권한으로 새로운 탄소 토큰을 발행합니다. 수수료가 적용되며, 발행한 토큰은 사용자에게 분배됩니다.

**파라미터**

- **`_from` (`address`)**: 토큰을 발행할 사용자 주소
- **`_carbonAmount` (`uint256`)**: 발행할 탄소 크레딧 수량
- **`_nonce` (`uint256`)**: 트랜잭션 고유값
- **`_metadata` (`string`)**: 토큰 메타데이터 URI
- **`_signature` (`bytes`)**: 서명 데이터
- **`_carbonPrice` (`uint256`)**: 탄소 크레딧의 USDT 가격

**로직**

1. `_carbonAmount`와 `_carbonPrice`가 유효한 값인지 검증합니다.
2. `hashMessage`를 생성하여 서명(`_signature`)을 검증합니다.
3. 바우처 컨트랙트에서 사용자가 충분한 잔액을 보유하고 있는지 확인합니다.
4. 수수료를 계산하고, 수수료만큼 바우처 컨트랙트에서 `feeAddress`로 전송합니다.
5. 잔여 토큰(`remainAmount`)을 사용자의 주소로 민팅합니다.
6. 새롭게 생성된 토큰의 메타데이터와 가격 정보를 저장합니다.
7. `_tokenIdTracker`를 증가시킵니다.

```solidity
function mint(
    address _from,
    uint256 _carbonAmount,
    uint256 _nonce,
    string memory _metadata,
    bytes memory _signature,
    uint256 _carbonPrice
) external operatorsOnly {
    require(_carbonAmount > 0, "Invalid carbon amount");
    require(_carbonPrice > 0, "Invalid carbon price");

    bytes32 message = hashMessage(_from, _carbonAmount, _nonce, _metadata, _carbonPrice);
    require(recoverSigner(message, _signature) == _from, "Invalid signature");

    uint256 fee = calculateFee(_carbonAmount, _carbonPrice);
    require(voucherContract.balanceOf(_from) >= fee, "Insufficient balance for fee");
    voucherContract.transferFrom(_from, feeAddress, fee);

    uint256 remainAmount = _carbonAmount - fee;
    _mint(_from, _tokenIdTracker.current(), remainAmount, "");
    tokenMetadata[_tokenIdTracker.current()] = _metadata;
    carbonMapPrice[_tokenIdTracker.current()] = _carbonPrice;

    _tokenIdTracker.increment();
}
```

------

#### **3. `transferWithSignature`**

**설명:** 사용자 간 서명 기반으로 탄소 토큰을 전송합니다. 수수료가 적용됩니다.

**파라미터**

- **`from` (`address`)**: 송신자 주소
- **`to` (`address`)**: 수신자 주소
- **`tokenId` (`uint256`)**: 전송할 토큰 ID
- **`amount` (`uint256`)**: 전송할 토큰 수량
- **`nonce` (`uint256`)**: 트랜잭션 고유값
- **`signature` (`bytes`)**: 서명 데이터

**로직**

1. `msg.sender`가 `to`인지 검증합니다.
2. `hashMessage`를 생성하여 서명(`signature`)을 검증합니다.
3. 수수료를 계산하고 `feeAddress`로 전송합니다.
4. 잔여 토큰을 `to`에게 안전하게 전송합니다.

```solidity
function transferWithSignature(
    address from,
    address to,
    uint256 tokenId,
    uint256 amount,
    uint256 nonce,
    bytes memory signature
) external nonReentrant operatorsOnly {
    require(to == msg.sender, "Invalid sender");
    require(balanceOf(from, tokenId) >= amount, "Insufficient balance");

    bytes32 message = hashMessage(from, to, tokenId, amount, nonce);
    require(recoverSigner(message, signature) == from, "Invalid signature");

    uint256 fee = calculateFee(amount, carbonMapPrice[tokenId]);
    safeTransferFrom(from, feeAddress, tokenId, fee, "");

    uint256 remainAmount = amount - fee;
    safeTransferFrom(from, to, tokenId, remainAmount, "");
}
```

------

#### **4. `transferWithGift`**

**설명:** 수수료 없이 사용자 간 토큰을 전송합니다.

**파라미터**

- **`from` (`address`)**: 송신자 주소
- **`to` (`address`)**: 수신자 주소
- **`tokenId` (`uint256`)**: 전송할 토큰 ID
- **`amount` (`uint256`)**: 전송할 토큰 수량
- **`nonce` (`uint256`)**: 트랜잭션 고유값
- **`signature` (`bytes`)**: 서명 데이터

**로직**

1. `msg.sender`가 `to`와 일치하는지 확인하여, 실제 수신자가 호출했는지 확인합니다.
2. 트랜잭션 데이터를 해싱하고 서명을 검증하여 발신자가 실제로 요청했는지 확인합니다.
3. 동일한 트랜잭션이 이미 처리된 경우 방지하기 위해 `transactionHashes` 맵을 확인하고, 이전에 처리된 트랜잭션이면 진행하지 않습니다.
4. 서명이 검증된 후, 지정된 `from` 주소에서 `to` 주소로 토큰을 안전하게 전송합니다.

#### 함수 코드

```solidity
function transferWithGift(
    address from,
    address to,
    uint256 tokenId,
    uint256 amount,
    uint256 nonce,
    bytes memory signature
) external nonReentrant {
    require(to == msg.sender, "Invalid sender");
    require(balanceOf(from, tokenId) >= amount, "Insufficient balance");

    bytes32 message = hashMessage(from, to, tokenId, amount, nonce);
    require(recoverSigner(message, signature) == from, "Invalid signature");

    safeTransferFrom(from, to, tokenId, amount, "");
}
```

---

#### 5. `recoverSigner`

**설명**

`recoverSigner` 함수는 서명을 복구하여 서명자가 누구인지 확인하는 데 사용됩니다.
Ethereum에서 서명은 메시지의 무결성을 확인하고 특정 개인(private key)만이 해당 서명을 생성했음을 증명합니다.
이 함수는 ECDSA(Elliptic Curve Digital Signature Algorithm)를 사용하여 서명에서 서명자의 주소를 복구합니다.

**파라미터**

- `hash`  (bytes32): 서명된 데이터의 해시.
- `signature` (bytes): 서명 데이터.

**로직**

1. **서명 분리:**
   서명 데이터(`signature`)를 `r`, `s`, `v` 값으로 분리합니다.
   - `r`: 서명의 첫 번째 부분
   - `s`: 서명의 두 번째 부분
   - `v`: 복구 ID (서명자가 만든 두 개의 서명 중 하나를 식별)
2. **주소 복구:**
   `ecrecover`를 사용하여 서명에서 서명자 주소를 복구합니다.
   - `ecrecover`는 메시지 해시, `v`, `r`, `s`를 입력으로 받아 서명자의 주소를 반환합니다.
3. **주소 반환:**
   복구된 주소를 반환하여 서명이 유효한지 확인합니다.

```solidity
function recoverSigner(bytes32 hash, bytes memory signature) internal pure returns (address) {
    require(signature.length == 65, "Invalid signature length");

    bytes32 r;
    bytes32 s;
    uint8 v;

    (r, s, v) = splitSignature(signature);

    address signer = ecrecover(hash, v, r, s);
    require(signer != address(0), "Invalid signature");

    return signer;
}
```

------

### 핵심 스마트 컨트랙트 관계도

![Extension Token Dependency](https://github.com/user-attachments/assets/04421d20-8454-46df-a029-fe7379ea1221)
