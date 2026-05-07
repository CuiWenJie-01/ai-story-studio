import React from 'react'
import styles from './EulaModal.module.css'

interface EulaModalProps {
  isOpen: boolean
  onAccept: () => void
  onReject: () => void
}

const EulaModal: React.FC<EulaModalProps> = ({ isOpen, onAccept, onReject }) => {
  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>用户协议与最终用户许可协议（EULA）</h2>
        </div>
        
        <div className={styles.content}>
          <div className={styles.eulaText}>
            <h3>最终用户许可协议（EULA）</h3>
            <p><strong>重要提示：</strong>在使用本软件之前，请仔细阅读以下条款。点击"同意"即表示您接受本协议的所有条款。如果您不同意这些条款，请点击"拒绝"并立即停止使用本软件。</p>
            
            <h4>1. 软件许可</h4>
            <p>本软件由合肥旭言文化传媒有限公司（以下简称"本公司"或"我们"）开发并授权给您使用。本协议授予您有限的、非独占的、不可转让的许可，仅用于按照本协议的条款使用本软件。</p>
            
            <h4>2. 知识产权与权属声明</h4>
            <p><strong>使用本软件的权益归合肥旭言文化传媒有限公司所有。</strong></p>
            <p>本软件及其所有副本的所有权、版权、商标权、专利权及其他知识产权均归本公司所有。本软件受中华人民共和国及国际版权法和其他知识产权法律法规的保护。</p>
            <p>您承认并同意：</p>
            <ul>
              <li>本软件的结构、组织和代码是本公司及许可方的宝贵商业秘密和机密信息</li>
              <li>您不得删除或修改软件中的任何版权声明、商标声明或其他权属声明</li>
              <li>您不得对本软件进行反向工程、反编译、反汇编或以其他方式试图发现其源代码</li>
            </ul>
            
            <h4>3. 使用限制</h4>
            <p>您不得：</p>
            <ul>
              <li>出租、租赁、出借、出售、再许可或分发本软件</li>
              <li>修改、改编、翻译本软件或基于本软件创作衍生作品</li>
              <li>移除或规避本软件中的任何技术保护措施</li>
              <li>将本软件用于任何非法目的或违反任何适用法律法规</li>
            </ul>
            
            <h4>4. 用户数据与隐私</h4>
            <p>我们重视您的隐私。本软件可能会收集某些使用数据以改进服务质量。我们承诺按照适用的隐私保护法律法规处理您的数据。</p>
            
            <h4>5. 免责声明</h4>
            <p>本软件按"现状"提供，不作任何明示或暗示的保证。在法律允许的最大范围内，我们不承担任何因使用或无法使用本软件而产生的直接或间接损失。</p>
            
            <h4>6. 协议终止</h4>
            <p>如果您违反本协议的任何条款，本协议将自动终止，无需另行通知。协议终止后，您必须立即停止使用本软件并销毁所有副本。</p>
            
            <h4>7. 适用法律</h4>
            <p>本协议受中华人民共和国法律管辖并按其解释。因本协议引起的或与本协议有关的任何争议，应提交本公司所在地有管辖权的人民法院解决。</p>
            
            <h4>8. 完整协议</h4>
            <p>本协议构成您与本公司之间关于本软件的完整协议，取代所有先前的口头或书面协议、谅解和陈述。</p>
            
            <p><strong>通过点击"同意"按钮，您确认您已阅读、理解并同意受本协议所有条款的约束。</strong></p>
          </div>
        </div>
        
        <div className={styles.footer}>
          <button 
            className={styles.rejectBtn} 
            onClick={onReject}
          >
            拒绝并退出
          </button>
          <button 
            className={styles.acceptBtn} 
            onClick={onAccept}
          >
            同意并继续使用
          </button>
        </div>
      </div>
    </div>
  )
}

export default EulaModal
