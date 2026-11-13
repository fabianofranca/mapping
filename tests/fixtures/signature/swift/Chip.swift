import SwiftUI

struct Chip: View {
    let title: String
    let count: Int

    init(_ title: String) {
        self.title = title
        self.count = 0
    }

    init(title: String, count: Int) {
        self.title = title
        self.count = count
    }

    @available(*, deprecated, message: "use init(title:count:)")
    init(label: String) {
        self.title = label
        self.count = 0
    }

    var body: some View {
        Text(title)
    }
}
