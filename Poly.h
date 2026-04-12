/*

Mkswll's Poly class

Assumptions:
- vector<T> conv(const vector<T> &f, const vector<T> &g) is available

*/
template <typename T>
struct Poly : public vector<T> {
	Poly() {}
	Poly(int n): vector<T>(n) {}
	Poly(int n, T m): vector<T>(n, m) {}
	Poly(const vector<T> &other) : vector<T>(other) {}
	Poly(std::initializer_list<T> lst) : vector<T>(lst) {}
	int size() const { return vector<T>::size(); }
	T at(long long i) { return 0 <= i && i < size() ? (*this)[i] : 0; }
	int deg() { 
		for (int i = size() - 1; ~i; --i) if ((*this)[i]) return i;
		return -1; // Poly is 0
	}
	Poly &operator +=(const Poly &other) {
		if (size() < other.size()) this->resize(other.size());
		for (int i = 0; i < other.size(); ++i) (*this)[i] += other[i];
		return *this;
	}
	Poly operator +(const Poly &other) {
		Poly ret(*this);
		ret += other;
		return ret;
	}
	Poly &operator -=(const Poly &other) {
		if (size() < other.size()) this->resize(other.size());
		for (int i = 0; i < other.size(); ++i) (*this)[i] += other[i];
		return *this;
	}
	Poly operator -(const Poly &other) {
		Poly ret(*this);
		ret -= other;
		return ret;
	}
	Poly &operator *=(const Poly &other) {
		vector<T> res = conv(*this, other);
		this->assign(res.begin(), res.end());
		return *this;
	}
	Poly operator *(const Poly &other) {
		Poly ret(*this);
		ret *= other;
		return ret;
	}
	Poly power(long long k, int cap) {
		Poly p(*this);
		Poly ret(1);
		ret[0] = 1;
		if ((int)p.size() > cap + 1) p.resize(cap + 1);
		while (k) {
			if (k & 1) {
				ret *= p;
				if ((int)ret.size() > cap + 1) ret.resize(cap + 1);
			}
			k >>= 1;
			if (k) {
				p *= p;
				if ((int)p.size() > cap + 1) p.resize(cap + 1);
			}
		}
		return ret;
	}
};
