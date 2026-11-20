import SwiftUI

extension Banner {
    public init(message: String, note: String = #"say "hi""#) {
        self.init(message, tone: .info)
    }
}
