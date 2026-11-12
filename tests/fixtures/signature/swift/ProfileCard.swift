import SwiftUI

/// A card with the name of a person and a few counters.
///
/// - Parameters:
///   - title: The name shown at the top of the card.
///   - badge: How many unread items the badge shows.
///   - onTap: Called when the card is tapped.
///   - content: The body of the card.
public struct ProfileCard<Content: View>: View {
    /// The look of the card.
    public enum Style: String, CaseIterable {
        case compact
        case regular
    }

    let title: String
    let badgeCount: Int
    let style: Style
    let onTap: (() -> Void)?
    let content: Content

    @State private var pressed = false
    @Environment(\.colorScheme) private var scheme

    /// Creates a card.
    ///
    /// - Parameter style: How tall the card is. Compact is the default.
    public init(
        _ title: String,
        badge badgeCount: Int = 0,
        style: Style = .compact,
        onTap: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.badgeCount = badgeCount
        self.style = style
        self.onTap = onTap
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading) {
            Text(title)
            content
        }
        .padding(style == .compact ? 8 : 16)
    }
}
