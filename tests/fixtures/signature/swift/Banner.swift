import SwiftUI

/// A banner with a tone.
public struct Banner: View {
    let title: String
    let tone: Tone

    public enum Tone { case info, warning }

#if os(iOS)
    public init(_ title: String, tone: Tone = .info) {
        self.title = title
        self.tone = tone
    }
#else
    public init(title: String) {
        self.title = title
        self.tone = .info
    }
#endif

    var body: some View {
        Text(title)
    }
}

extension Banner {
    public init(warning title: String, prefix: String = #"\u{26A0} "#) {
        self.init(prefix + title, tone: .warning)
    }
}

public struct Pill: View {
    let text: String

    var body: some View {
        Text(text)
    }
}

extension Pill {
    public init(count: Int) {
        self.init(text: "\(count)")
    }
}
